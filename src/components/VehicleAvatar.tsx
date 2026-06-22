import type { CSSProperties } from "react";
import { Car } from "lucide-react";
import { cn } from "@/lib/utils";

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
  return Object.entries(COLOR_TOKENS).find(([name]) => raw.includes(name))?.[1] ?? "var(--vehicle-default)";
}

export function VehicleAvatar({
  imageUrl,
  make,
  model,
  color,
  className,
}: {
  imageUrl?: string | null;
  make: string;
  model: string;
  color?: string | null;
  className?: string;
}) {
  const paint = paintFor(color);
  const style = { "--vehicle-paint": paint } as CSSProperties;
  const alt = `${make} ${model}`;

  return (
    <span className={cn("relative isolate flex shrink-0 items-center justify-center overflow-hidden bg-accent", className)} style={style}>
      {imageUrl ? (
        <img src={imageUrl} alt={alt} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <svg viewBox="0 0 96 62" aria-label={alt} role="img" className="h-[82%] w-[88%] drop-shadow-sm">
          <path d="M18 39.5c1.8-8 7.3-17.6 14.5-20.3 6.8-2.5 25.6-2.8 33.1-.2 5.1 1.8 10.6 9.4 12.9 17.5l4.7 1.6c2.8.9 4.8 3.5 4.8 6.5v4.1H8v-4.3c0-2.9 1.8-5.5 4.6-6.4l5.4-1.7Z" fill="var(--vehicle-paint)" stroke="currentColor" strokeOpacity="0.14" strokeWidth="2" />
          <path d="M34.5 23.5h12.8v12.2H25.4c2.1-5.3 5.1-10.2 9.1-12.2Zm16.3 0h11.1c4.3 1.3 8.3 6.8 10.7 12.2H50.8V23.5Z" fill="var(--card)" opacity="0.82" />
          <circle cx="27" cy="49" r="7.5" fill="var(--foreground)" opacity="0.72" />
          <circle cx="70" cy="49" r="7.5" fill="var(--foreground)" opacity="0.72" />
          <circle cx="27" cy="49" r="3" fill="var(--card)" opacity="0.9" />
          <circle cx="70" cy="49" r="3" fill="var(--card)" opacity="0.9" />
        </svg>
      )}
      {color ? (
        <span
          aria-label={`${color} colour`}
          className="absolute bottom-1 right-1 h-3 w-3 rounded-full border border-card shadow-sm"
          style={{ backgroundColor: "var(--vehicle-paint)" }}
        />
      ) : null}
      {!imageUrl ? <Car className="sr-only" /> : null}
    </span>
  );
}