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
      const photo = await Camera.getPhoto({
        quality: 78,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera, // camera only — never Photos/Gallery
        saveToGallery: false,
        correctOrientation: true,
      });
      if (!photo.base64String) return null;
      const bytes = Uint8Array.from(atob(photo.base64String), (c) => c.charCodeAt(0));
      const type = photo.format ? `image/${photo.format}` : "image/jpeg";
      return new File([bytes], `capture-${Date.now()}.${photo.format ?? "jpg"}`, { type });
    } catch (err) {
      console.warn("[camera] native capture failed, falling back to web input", err);
      // fall through to web fallback
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
