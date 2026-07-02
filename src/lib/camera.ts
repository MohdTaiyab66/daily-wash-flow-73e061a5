/**
 * Camera-only capture helper.
 *
 * P0-07 mandate: partners MUST NOT be able to pick photos from the gallery.
 * On native (Capacitor Camera) we force `source: CAMERA`. On the web we fall
 * back to a hidden `<input type="file" accept="image/*" capture="environment">`
 * which most mobile browsers honour as "open the camera". Desktop browsers
 * that ignore `capture` are irrelevant for the partner APK, but the fallback
 * is still safe: no file is uploaded unless the user picks/captures one.
 */
import { isNative } from "@/lib/platform";

export async function captureFromCamera(): Promise<File | null> {
  if (isNative()) {
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
      });
      if (!photo.webPath) return null;
      const type = photo.format ? `image/${photo.format}` : "image/jpeg";
      const blob = await fetch(photo.webPath).then((r) => r.blob());
      return new File([blob], `capture-${Date.now()}.${photo.format ?? "jpg"}`, { type: blob.type || type });
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
