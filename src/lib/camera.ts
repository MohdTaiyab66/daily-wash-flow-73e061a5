/**
 * Camera-only capture helper.
 *
 * P0-07 mandate: partners MUST NOT be able to pick photos from the gallery.
 * On native (Capacitor Camera) we force `source: Camera`. On the web we fall
 * back to a hidden `<input type="file" accept="image/*" capture="environment">`
 * which most mobile browsers honour as "open the camera". Desktop browsers
 * that ignore `capture` are irrelevant for the partner APK, but the fallback
 * is still safe: no file is uploaded unless the user picks/captures one.
 */
import { Capacitor } from "@capacitor/core";
import { clearPendingCapture, persistPendingCapture } from "@/lib/cameraRestore";
import { isNative, nativePlatform } from "@/lib/platform";

type CaptureContext = {
  serviceId?: string | null;
  assignmentId?: string | null;
  workflow?: "service_photo" | "dirty_vehicle" | "unavailable_vehicle";
  stage?: "before" | "after" | "report";
  angle?: string;
  slot?: string;
};

let activeCapture = false;

export async function captureFromCamera(context: CaptureContext = {}): Promise<File | null> {
  // Never share one native camera result across two UI slots. Returning the
  // same promise is what can mark the wrong slot complete after quick taps.
  if (activeCapture) return null;
  activeCapture = true;
  persistPendingCapture(context);
  try {
    const file = await captureFromCameraOnce();
    clearPendingCapture();
    return file;
  } catch (err) {
    clearPendingCapture();
    throw err;
  } finally {
    activeCapture = false;
  }
}

async function captureFromCameraOnce(): Promise<File | null> {
  if (shouldUseNativeCamera()) {
    try {
      const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
      let permissions = await Camera.checkPermissions();
      if (permissions.camera !== "granted") {
        permissions = await Camera.requestPermissions({ permissions: ["camera"] });
      }
      if (permissions.camera !== "granted") return null;
      const photo = await Camera.getPhoto({
        quality: 72,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera, // camera only — never Photos/Gallery
        saveToGallery: false,
        correctOrientation: true,
        width: 1600,
        promptLabelHeader: "Camera",
        promptLabelPhoto: "Camera",
        promptLabelPicture: "Take photo",
      });
      if (!photo.webPath) return null;
      const response = await fetch(photo.webPath);
      const blob = await response.blob();
      return new File([blob], `capture-${Date.now()}.${photo.format ?? "jpg"}`, { type: blob.type || "image/jpeg" });
    } catch (err) {
      console.warn("[camera] native capture failed", err);
      return null;
    }
  }

  if (isAndroidWebView()) {
    console.warn("[camera] native bridge unavailable in Android WebView; blocked gallery fallback");
    return null;
  }

  return new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    // `capture` = camera on mobile browsers; ignored on desktop where partners
    // don't run the field app anyway.
    input.setAttribute("capture", "environment");
    input.style.display = "none";
    let resolved = false;
    const finish = (file: File | null) => {
      if (resolved) return;
      resolved = true;
      window.removeEventListener("focus", onFocus);
      input.remove();
      resolve(file);
    };
    const onFocus = () => {
      window.setTimeout(() => finish(input.files?.[0] ?? null), 400);
    };
    window.addEventListener("focus", onFocus, { once: true });
    input.onchange = () => {
      const f = input.files?.[0] ?? null;
      finish(f);
    };
    input.oncancel = () => {
      finish(null);
    };
    document.body.appendChild(input);
    input.click();
  });
}

function shouldUseNativeCamera() {
  if (isNative() || nativePlatform() !== "web") return true;
  try {
    return Capacitor.isNativePlatform?.() === true || Capacitor.getPlatform?.() === "android" || Capacitor.getPlatform?.() === "ios";
  } catch {
    return false;
  }
}

function isAndroidWebView() {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent) && /; wv\)|Version\/\d+\.\d+ Chrome\//i.test(navigator.userAgent);
}
