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
import { isNative, nativePlatform } from "@/lib/platform";

let activeCapture: Promise<File | null> | null = null;

export async function captureFromCamera(): Promise<File | null> {
  if (activeCapture) return activeCapture;
  activeCapture = captureFromCameraOnce().finally(() => {
    activeCapture = null;
  });
  return activeCapture;
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
        quality: 70,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera, // camera only — never Photos/Gallery
        saveToGallery: false,
        correctOrientation: true,
        width: 1600,
      });
      if (!photo.dataUrl) return null;
      return fileFromDataUrl(photo.dataUrl, `capture-${Date.now()}.${photo.format ?? "jpg"}`);
    } catch (err) {
      console.warn("[camera] native capture failed", err);
      return null;
    }
  }

  return new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    // `capture` = camera on mobile browsers; ignored on desktop where partners
    // don't run the field app anyway.
    input.setAttribute("capture", "environment");
    input.style.display = "none";
    input.onchange = () => {
      const f = input.files?.[0] ?? null;
      input.remove();
      resolve(f);
    };
    input.oncancel = () => {
      input.remove();
      resolve(null);
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

function fileFromDataUrl(dataUrl: string, name: string) {
  const [header, payload] = dataUrl.split(",");
  const mime = header.match(/^data:(.*?);/)?.[1] || "image/jpeg";
  const binary = atob(payload ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}
