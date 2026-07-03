/**
 * File picker helper for image uploads (admin panel, customer app, imports).
 *
 * This deliberately opens the OS file browser — never the device camera.
 * Camera-only capture lives in `@/lib/camera` and is restricted to the
 * Partner Service Module (Before / After / Dirty / Unavailable).
 */

export const FILE_PICKER_UNAVAILABLE_MESSAGE = "File picker unavailable";

export function selectImageFile(options: { accept?: string; multiple?: false } = {}): Promise<File | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(null);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = options.accept ?? "image/*";
    // No `capture` attribute — this is a gallery/file picker, not a camera intent.
    input.style.position = "fixed";
    input.style.left = "-9999px";
    let settled = false;
    const done = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener("change", () => {
      const file = input.files?.[0] ?? null;
      done(file);
    });
    // If the user cancels the picker, no `change` fires. `focus` on window
    // returns after the dialog closes — use it to resolve null so callers
    // don't hang forever.
    const onFocus = () => {
      window.removeEventListener("focus", onFocus);
      setTimeout(() => done(null), 500);
    };
    window.addEventListener("focus", onFocus);
    document.body.appendChild(input);
    input.click();
  });
}
