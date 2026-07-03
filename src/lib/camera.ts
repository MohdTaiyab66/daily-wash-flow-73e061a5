/**
 * Camera-only capture helper.
 *
 * P0 mandate: Partner evidence photos must come from a live camera only.
 * There is deliberately no picker prompt, gallery, Photos source, or upload
 * fallback anywhere in this helper.
 */
import { clearPendingCapture, consumeRestoredCapture, persistPendingCapture } from "@/lib/cameraRestore";
import { isNative, nativePlatform } from "@/lib/platform";
import { Camera as CapacitorCamera, CameraDirection, type MediaResult } from "@capacitor/camera";

type CaptureContext = {
  serviceId?: string | null;
  assignmentId?: string | null;
  workflow?: "service_photo" | "dirty_vehicle" | "unavailable_vehicle";
  stage?: "before" | "after" | "report";
  angle?: string;
  slot?: string;
};

let activeCapture = false;

export const CAMERA_UNAVAILABLE_MESSAGE = "Camera unavailable";

export async function captureFromCamera(context: CaptureContext = {}): Promise<File | null> {
  // Never share one native camera result across two UI slots. Returning the
  // same promise is what can mark the wrong slot complete after quick taps.
  if (activeCapture) return null;
  activeCapture = true;
  persistPendingCapture(context);
  try {
    const restored = context.slot ? consumeRestoredCapture(context.slot) : null;
    const file = restored
      ? fileFromBase64(restored.base64String, restored.format ?? "jpeg")
      : await captureFromCameraOnce();
    clearPendingCapture();
    return file;
  } catch (err) {
    clearPendingCapture();
    throw err;
  } finally {
    activeCapture = false;
  }
}

export function consumeRestoredCameraCapture(context: Pick<CaptureContext, "slot">): File | null {
  if (!context.slot) return null;
  const restored = consumeRestoredCapture(context.slot);
  if (!restored) return null;
  return fileFromBase64(restored.base64String, restored.format ?? "jpeg");
}

async function captureFromCameraOnce(): Promise<File | null> {
  if (shouldUseNativeCamera()) {
    try {
      const getCameraPhoto = () => CapacitorCamera.takePhoto({
        quality: 70,
        saveToGallery: false,
        correctOrientation: true,
        cameraDirection: CameraDirection.Rear,
        editable: "no",
        targetWidth: 1600,
        targetHeight: 1200,
        includeMetadata: true,
      });
      let photo: MediaResult;
      try {
        // Call the native camera immediately. Pre-checking permissions first can
        // break the tap → camera chain on Android and sometimes returns to the app
        // without opening the camera.
        photo = await getCameraPhoto();
      } catch (err) {
        const e = err as { message?: string; code?: string };
        const permissionLike = /permission|denied|not.?grant|not.?allow/i.test(`${e?.code ?? ""} ${e?.message ?? ""}`);
        if (!permissionLike) throw err;
        const permissions = await CapacitorCamera.requestPermissions({ permissions: ["camera"] });
        if (permissions.camera !== "granted") return null;
        photo = await getCameraPhoto();
      }
      return fileFromMediaResult(photo);
    } catch (err) {
      console.warn("[camera] native capture failed", err);
      return null;
    }
  }

  return captureWithBrowserCamera();
}

function shouldUseNativeCamera(): boolean {
  if (isNative() || nativePlatform() !== "web") return true;
  if (typeof window !== "undefined" && (window as any).Capacitor?.isNativePlatform?.()) return true;
  return false;
}

function fileFromBase64(base64: string, format: string) {
  const mime = format === "png" ? "image/png" : "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], `capture-${Date.now()}.${format === "png" ? "png" : "jpg"}`, { type: mime });
}

async function fileFromMediaResult(result: MediaResult): Promise<File | null> {
  const format = normalizeImageFormat(result.metadata?.format);
  const mime = format === "png" ? "image/png" : "image/jpeg";
  if (result.webPath || result.uri) {
    try {
      const res = await fetch(result.webPath ?? result.uri!);
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 0) return new File([blob], `capture-${Date.now()}.${format === "png" ? "png" : "jpg"}`, { type: blob.type || mime });
      }
    } catch (err) {
      console.warn("[camera] captured file fetch failed", err);
    }
  }
  if (result.thumbnail) return fileFromBase64(result.thumbnail, format);
  return null;
}

function normalizeImageFormat(format?: string) {
  const f = (format ?? "jpeg").toLowerCase();
  return f === "png" ? "png" : "jpeg";
}

async function captureWithBrowserCamera(): Promise<File | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    return await showBrowserCameraOverlay(stream);
  } catch (err) {
    console.warn("[camera] browser camera unavailable", err);
    stream?.getTracks().forEach((track) => track.stop());
    return null;
  }
}

function showBrowserCameraOverlay(stream: MediaStream): Promise<File | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#000;display:flex;flex-direction:column;";

    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    video.style.cssText = "flex:1;width:100%;min-height:0;object-fit:cover;background:#000;";

    const controls = document.createElement("div");
    controls.style.cssText = "display:flex;gap:12px;justify-content:center;padding:16px;background:#000;";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.style.cssText = "border:1px solid #555;border-radius:8px;background:#111;color:#fff;padding:12px 18px;font:600 14px system-ui;";

    const capture = document.createElement("button");
    capture.type = "button";
    capture.textContent = "Capture";
    capture.style.cssText = "border:0;border-radius:8px;background:#fff;color:#000;padding:12px 22px;font:700 14px system-ui;";

    controls.append(cancel, capture);
    overlay.append(video, controls);
    document.body.appendChild(overlay);

    const finish = (file: File | null) => {
      stream.getTracks().forEach((track) => track.stop());
      overlay.remove();
      resolve(file);
    };

    const fallbackDataUrlFile = () => {
      const dataUrl = canvasToDataUrl(video);
      if (!dataUrl) return null;
      const [header, data] = dataUrl.split(",");
      const mime = header.match(/data:(.*?);base64/)?.[1] ?? "image/jpeg";
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return new File([bytes], `capture-${Date.now()}.jpg`, { type: mime });
    };

    cancel.onclick = () => finish(null);
    capture.onclick = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) return finish(null);
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch (err) {
        console.warn("[camera] frame capture failed", err);
        return finish(null);
      }
      let settled = false;
      const done = (file: File | null) => {
        if (settled) return;
        settled = true;
        finish(file);
      };
      if (typeof canvas.toBlob === "function") {
        canvas.toBlob(
          (blob) => done(blob ? new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" }) : fallbackDataUrlFile()),
          "image/jpeg",
          0.82,
        );
      } else {
        done(fallbackDataUrlFile());
      }
      window.setTimeout(() => done(fallbackDataUrlFile()), 1200);
    };
  });
}

function canvasToDataUrl(video: HTMLVideoElement): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return null;
  }
}
