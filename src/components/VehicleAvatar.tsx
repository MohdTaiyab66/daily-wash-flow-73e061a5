import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { vehicleBodyLabel } from "@/lib/vehicle-category";
import carSuv from "@/assets/car-suv.png";
import carSedan from "@/assets/car-sedan.png";
import carHatchback from "@/assets/car-hatchback.png";
import carMpv from "@/assets/car-mpv.png";

const COLOR_TOKENS: Record<string, string> = {
  white: "var(--vehicle-white)",
  pearl: "var(--vehicle-white)",
  black: "var(--vehicle-black)",
  grey: "var(--vehicle-grey)",
  gray: "var(--vehicle-grey)",
  silver: "var(--vehicle-silver)",
  red: "var(--vehicle-red)",
  blue: "var(--vehicle-blue)",
  navy: "var(--vehicle-blue)",
  green: "var(--vehicle-green)",
  yellow: "var(--vehicle-yellow)",
  orange: "var(--vehicle-orange)",
  brown: "var(--vehicle-brown)",
  beige: "var(--vehicle-beige)",
  gold: "var(--vehicle-gold)",
};

function paintFor(color?: string | null) {
  const raw = color?.trim().toLowerCase();
  if (!raw) return "var(--vehicle-default)";
  return (
    Object.entries(COLOR_TOKENS).find(([name]) => raw.includes(name))?.[1] ??
    "var(--vehicle-default)"
  );
}

function silhouetteFor(make: string, model: string, category?: string | null) {
  const label = vehicleBodyLabel(make, model, category ?? undefined);
  if (label === "SUV") return carSuv;
  if (label === "Hatchback") return carHatchback;
  if (label.includes("Sedan") || label.includes("Compact")) return carSedan;
  if (model.toLowerCase().match(/innova|ertiga|carens|carnival|triber|hycross|xl6/)) return carMpv;
  return carSedan;
}

export function VehicleAvatar({
  imageUrl,
  make,
  model,
  color,
  category,
  className,
}: {
  imageUrl?: string | null;
  make: string;
  model: string;
  color?: string | null;
  category?: string | null;
  className?: string;
}) {
  const paint = paintFor(color);
  const alt = `${make} ${model}`;

  if (imageUrl) {
    return (
      <span
        className={cn(
          "relative isolate flex shrink-0 items-center justify-center overflow-hidden bg-accent",
          className,
        )}
      >
        <img src={imageUrl} alt={alt} className="h-full w-full object-cover" loading="lazy" />
        {color ? (
          <span
            aria-label={`${color} colour`}
            className="absolute bottom-1 right-1 h-3 w-3 rounded-full border border-card shadow-sm"
            style={{ backgroundColor: paint }}
          />
        ) : null}
      </span>
    );
  }

  const silhouette = silhouetteFor(make, model, category);
  const maskStyle: CSSProperties = {
    backgroundColor: paint,
    WebkitMaskImage: `url(${silhouette})`,
    maskImage: `url(${silhouette})`,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
    WebkitMaskSize: "contain",
    maskSize: "contain",
  };

  return (
    <span
      className={cn(
        "relative isolate flex shrink-0 items-center justify-center overflow-hidden bg-accent",
        className,
      )}
      role="img"
      aria-label={alt}
    >
      <span className="block h-[88%] w-[92%]" style={maskStyle} />
      {color ? (
        <span
          aria-label={`${color} colour`}
          className="absolute bottom-1 right-1 h-3 w-3 rounded-full border border-card shadow-sm"
          style={{ backgroundColor: paint }}
        />
      ) : null}
    </span>
  );
}
