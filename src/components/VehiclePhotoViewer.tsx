import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { X, Car, ZoomIn } from "lucide-react";

type Photo = { path?: string | null; url?: string | null; label?: string };

type Props = {
  open: boolean;
  onClose: () => void;
  photos: Photo[];
  customerName?: string | null;
  vehicleLabel?: string | null;
  registration?: string | null;
};

/** Full-screen zoomable vehicle photo viewer. Pinch-zoom via native gesture, double-tap toggles 2x. */
export function VehiclePhotoViewer({ open, onClose, photos, customerName, vehicleLabel, registration }: Props) {
  const [idx, setIdx] = useState(0);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [zoomed, setZoomed] = useState(false);
  const lastTapRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setIdx(0);
    setZoomed(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    photos.forEach((p, i) => {
      if (urls[i]) return;
      if (p.url) {
        setUrls((prev) => ({ ...prev, [i]: p.url! }));
        return;
      }
      if (!p.path) return;
      supabase.storage
        .from("vehicle-images")
        .createSignedUrl(p.path, 60 * 60)
        .then(({ data }) => {
          if (!cancelled && data?.signedUrl) {
            setUrls((prev) => ({ ...prev, [i]: data.signedUrl }));
          }
        });
    });
    return () => {
      cancelled = true;
    };
  }, [open, photos]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIdx((i) => Math.min(photos.length - 1, i + 1));
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, photos.length]);

  if (!open || typeof document === "undefined") return null;

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) setZoomed((z) => !z);
    lastTapRef.current = now;
  };

  const url = urls[idx] ?? null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/95 text-white">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{customerName ?? "Vehicle"}</p>
          <p className="truncate text-[11px] text-white/60">
            {vehicleLabel}
            {registration ? ` · ${registration}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/10 backdrop-blur transition-colors hover:bg-white/20"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        className="relative flex flex-1 items-center justify-center overflow-auto"
        style={{ touchAction: "pinch-zoom" }}
        onClick={handleTap}
      >
        {url ? (
          <img
            src={url}
            alt={vehicleLabel ?? "Vehicle"}
            className="max-h-full max-w-full select-none object-contain transition-transform duration-200"
            style={{ transform: zoomed ? "scale(2)" : "scale(1)", touchAction: "pinch-zoom" }}
            draggable={false}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-white/60">
            <Car className="h-10 w-10" />
            <p className="text-xs">No photo available</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-4 py-4">
        <button
          type="button"
          disabled={idx === 0}
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium disabled:opacity-30"
        >
          ◀ Prev
        </button>
        <div className="flex items-center gap-2 text-xs text-white/70">
          <ZoomIn className="h-3.5 w-3.5" />
          <span>Double-tap or pinch to zoom</span>
        </div>
        <button
          type="button"
          disabled={idx >= photos.length - 1}
          onClick={() => setIdx((i) => Math.min(photos.length - 1, i + 1))}
          className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium disabled:opacity-30"
        >
          Next ▶
        </button>
      </div>
      {photos.length > 1 && (
        <div className="pb-4 text-center text-[11px] text-white/60 tabular-nums">
          {idx + 1} / {photos.length}
        </div>
      )}
    </div>,
    document.body,
  );
}

/** Wrap a VehicleImage so tapping opens the full-screen viewer. */
export function TappableVehicleImage({
  path,
  className,
  alt,
  customerName,
  vehicleLabel,
  registration,
  photoCountBadge,
}: {
  path?: string | null;
  className?: string;
  alt?: string;
  customerName?: string | null;
  vehicleLabel?: string | null;
  registration?: string | null;
  photoCountBadge?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(true);
        }}
        className={`relative block overflow-hidden ${className ?? ""}`}
        aria-label="View vehicle photo"
      >
        {/* Import lazily to avoid circular issues */}
        <InnerImg path={path} alt={alt} />
        {photoCountBadge && photoCountBadge > 1 && (
          <span className="absolute bottom-1 right-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-white">
            {photoCountBadge}
          </span>
        )}
      </button>
      <VehiclePhotoViewer
        open={open}
        onClose={() => setOpen(false)}
        photos={path ? [{ path }] : []}
        customerName={customerName}
        vehicleLabel={vehicleLabel}
        registration={registration}
      />
    </>
  );
}

function InnerImg({ path, alt }: { path?: string | null; alt?: string }) {
  // Reuse the existing signed-url flow
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(null);
      return;
    }
    supabase.storage
      .from("vehicle-images")
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (!cancelled) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  if (!path) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted">
        <Car className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }
  if (!url) return <div className="h-full w-full bg-muted" />;
  return <img src={url} alt={alt ?? "Vehicle"} className="h-full w-full object-cover" />;
}
