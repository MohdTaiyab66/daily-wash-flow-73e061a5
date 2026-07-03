/**
 * Camera-only capture helper.
 *
 * P0 mandate: Partner evidence photos must come from a live camera only.
 * There is deliberately no picker prompt, gallery, Photos source, or upload
 * fallback anywhere in this helper.
 */
import { clearPendingCapture, consumeRestoredCapture, persistPendingCapture, type RestoredCapture } from "@/lib/cameraRestore";
import { isNative, nativePlatform } from "@/lib/platform";
import { Capacitor } from "@capacitor/core";
import { Camera as CapacitorCamera, CameraDirection, CameraResultType, CameraSource, type MediaResult, type Photo } from "@capacitor/camera";

type CaptureContext = {
  serviceId?: string | null;
  assignmentId?: string | null;
  workflow?: "service_photo" | "dirty_vehicle" | "unavailable_vehicle";
  stage?: "before" | "after" | "report";
  angle?: string;
  slot?: string;
};

type CaptureFile = File;

let activeCapture = false;

export const CAMERA_UNAVAILABLE_MESSAGE = "Camera unavailable";

export async function captureFromCamera(context: CaptureContext = {}): Promise<CaptureFile | null> {
  // Never share one native camera result across two UI slots. Returning the
  // same promise is what can mark the wrong slot complete after quick taps.
  if (activeCapture) return null;
  activeCapture = true;
  persistPendingCapture(context);
  try {
    const restored = context.slot ? consumeRestoredCapture(context.slot) : null;
    const file = restored ? await fileFromRestoredCapture(restored) : await captureFromCameraOnce();
    clearPendingCapture();
    return file;
  } catch (err) {
    clearPendingCapture();
    throw err;
  } finally {
    activeCapture = false;
  }
}

export async function consumeRestoredCameraCapture(context: Pick<CaptureContext, "slot">): Promise<CaptureFile | null> {
  if (!context.slot) return null;
  const restored = consumeRestoredCapture(context.slot);
  if (!restored) return null;
  return fileFromRestoredCapture(restored);
}

async function fileFromRestoredCapture(restored: RestoredCapture): Promise<CaptureFile | null> {
  if (restored.base64String) return fileFromBase64(restored.base64String, restored.format ?? "jpeg");
  const format = normalizeImageFormat(restored.format);
  const mime = format === "png" ? "image/png" : "image/jpeg";
  const native = await fileFromNativePath(restored.uri ?? null, mime, format);
  if (native) return native;
  const url = normalizeNativeFileUrl(restored.webPath ?? null);
  return url ? fileFromUrl(url, mime, format) : null;
}

async function captureFromCameraOnce(): Promise<CaptureFile | null> {
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
      const primary = err as { message?: string; code?: string };
      const cancelled = /cancel/i.test(`${primary?.code ?? ""} ${primary?.message ?? ""}`);
      if (cancelled) return null;
      console.warn("[camera] native takePhoto failed; retrying camera-only legacy capture", err);
      try {
        const legacy = await CapacitorCamera.getPhoto({
          quality: 70,
          resultType: CameraResultType.Uri,
          source: CameraSource.Camera,
          saveToGallery: false,
          correctOrientation: true,
          direction: CameraDirection.Rear,
          allowEditing: false,
          width: 1600,
          height: 1200,
        });
        return fileFromLegacyPhoto(legacy);
      } catch (fallbackErr) {
        console.warn("[camera] native legacy capture failed", fallbackErr);
        return null;
      }
    }
  }

  return captureWithBrowserCamera();
}

function shouldUseNativeCamera(): boolean {
  if (isNative() || nativePlatform() !== "web") return true;
  if (typeof window !== "undefined" && (window as any).Capacitor?.isNativePlatform?.()) return true;
  return false;
}

function fileFromBase64(base64: string, format: string): CaptureFile {
  const mime = format === "png" ? "image/png" : "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], `capture-${Date.now()}.${format === "png" ? "png" : "jpg"}`, { type: mime });
}

async function fileFromMediaResult(result: MediaResult): Promise<CaptureFile | null> {
  const format = normalizeImageFormat(result.metadata?.format);
  const mime = format === "png" ? "image/png" : "image/jpeg";
  const native = await fileFromNativePath(result.uri ?? null, mime, format);
  if (native) return native;
  if (result.thumbnail) return fileFromBase64(result.thumbnail, format);
  const url = normalizeNativeFileUrl(result.webPath ?? result.uri ?? null);
  if (url) {
    const fetched = await fileFromUrl(url, mime, format);
    if (fetched) return fetched;
  }
  return null;
}

async function fileFromLegacyPhoto(result: Photo): Promise<CaptureFile | null> {
  const format = normalizeImageFormat(result.format);
  const mime = format === "png" ? "image/png" : "image/jpeg";
  if (result.base64String) return fileFromBase64(result.base64String, format);
  if (result.dataUrl) return fileFromDataUrl(result.dataUrl);
  const native = await fileFromNativePath(result.path ?? null, mime, format);
  if (native) return native;
  const url = normalizeNativeFileUrl(result.webPath ?? result.path ?? null);
  if (url) {
    const fetched = await fileFromUrl(url, mime, format);
    if (fetched) return fetched;
  }
  return null;
}

async function fileFromUrl(url: string, mime: string, format: string): Promise<CaptureFile | null> {
  try {
    const res = await fetch(url);
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 0) return new File([blob], `capture-${Date.now()}.${format === "png" ? "png" : "jpg"}`, { type: blob.type || mime });
    }
  } catch (err) {
    console.warn("[camera] captured file fetch failed", err);
  }
  return null;
}

async function fileFromNativePath(value: string | null, mime: string, format: string): Promise<CaptureFile | null> {
  const path = normalizeFilesystemPath(value);
  if (!path) return null;
  try {
    const { Filesystem } = await import("@capacitor/filesystem");
    const { data } = await Filesystem.readFile({ path });
    if (typeof data === "string" && data.length > 0) return fileFromBase64(data, format);
    if (data instanceof Blob && data.size > 0) return new File([data], `capture-${Date.now()}.${format === "png" ? "png" : "jpg"}`, { type: data.type || mime });
  } catch (err) {
    console.warn("[camera] native file read failed", err);
  }
  return null;
}

function normalizeFilesystemPath(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("file://") || value.startsWith("content://")) return value;
  if (value.startsWith("/")) return `file://${value}`;
  return null;
}

function fileFromDataUrl(dataUrl: string): CaptureFile | null {
  try {
    const [header, data] = dataUrl.split(",");
    if (!data) return null;
    const mime = header.match(/data:(.*?);base64/)?.[1] ?? "image/jpeg";
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], `capture-${Date.now()}.jpg`, { type: mime });
  } catch {
    return null;
  }
}

function normalizeNativeFileUrl(value: string | null): string | null {
  if (!value) return null;
  if (/^https?:|^capacitor:|^data:|^blob:/.test(value)) return value;
  if (/^file:/.test(value)) return Capacitor.convertFileSrc(value);
  if (value.startsWith("/")) return Capacitor.convertFileSrc(`file://${value}`);
  return value;
}

function normalizeImageFormat(format?: string) {
  const f = (format ?? "jpeg").toLowerCase();
  return f === "png" ? "png" : "jpeg";
}

async function captureWithBrowserCamera(): Promise<CaptureFile | null> {
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

function showBrowserCameraOverlay(stream: MediaStream): Promise<CaptureFile | null> {
  return new Promise((resolve) => {
    let finished = false;
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#000;display:flex;flex-direction:column;touch-action:none;user-select:none;-webkit-user-select:none;";

    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    video.style.cssText = "flex:1;width:100%;min-height:0;object-fit:cover;background:#000;";

    const controls = document.createElement("div");
    controls.style.cssText = "display:flex;gap:12px;justify-content:center;padding:16px;background:#000;touch-action:manipulation;user-select:none;-webkit-user-select:none;";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.style.cssText = "border:1px solid #555;border-radius:8px;background:#111;color:#fff;padding:12px 18px;font:600 14px system-ui;touch-action:manipulation;user-select:none;-webkit-user-select:none;cursor:pointer;";

    const capture = document.createElement("button");
    capture.type = "button";
    capture.textContent = "Capture";
    capture.style.cssText = "border:0;border-radius:8px;background:#fff;color:#000;padding:14px 26px;font:700 16px system-ui;touch-action:manipulation;user-select:none;-webkit-user-select:none;cursor:pointer;";

    controls.append(cancel, capture);
    overlay.append(video, controls);
    document.body.appendChild(overlay);

    const finish = (file: CaptureFile | null) => {
      if (finished) return;
      finished = true;
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

    const takeSnapshot = async () => {
      capture.disabled = true;
      capture.textContent = "Saving…";
      const videoReady = await waitForVideoFrame(video);
      if (!videoReady) {
        console.warn("[camera] video frame not ready");
        return finish(null);
      }
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

    const bindTap = (el: HTMLElement, action: () => void) => {
      let handledAt = 0;
      const run = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        const now = Date.now();
        if (now - handledAt < 500) return;
        handledAt = now;
        void action();
      };
      el.addEventListener("pointerdown", run, { passive: false });
      el.addEventListener("pointerup", run, { passive: false });
      el.addEventListener("touchstart", run, { passive: false });
      el.addEventListener("touchend", run, { passive: false });
      el.addEventListener("mousedown", run, { passive: false });
      el.addEventListener("click", run, { passive: false });
    };

    bindTap(cancel, () => finish(null));
    bindTap(capture, takeSnapshot);
  });
}

function waitForVideoFrame(video: HTMLVideoElement): Promise<boolean> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      resolve(ok);
    };
    const onReady = () => done(video.videoWidth > 0 && video.videoHeight > 0);
    video.addEventListener("loadeddata", onReady, { once: true });
    video.addEventListener("canplay", onReady, { once: true });
    window.setTimeout(() => done(video.videoWidth > 0 && video.videoHeight > 0), 1500);
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
