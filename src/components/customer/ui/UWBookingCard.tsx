import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Surface } from "./kit";

interface UWBookingCardProps {
  id: string;
  name: string;
  date: string;
  price: number;
  time?: string;
  status: {
    label: string;
    tone: "primary" | "success" | "warning" | "danger" | "neutral" | "info" | "brand";
  };
  image?: string;
  isSubscription?: boolean;
  onClick: () => void;
}

export function UWBookingCard({
  name,
  date,
  price,
  time,
  status,
  image,
  isSubscription,
  onClick,
}: UWBookingCardProps) {
  // Extract day and month from "DD MMM"
  const dateParts = date.split(" ");
  const day = dateParts[0];
  const month = dateParts[1];

  return (
    <Surface
      onClick={onClick}
      className="flex items-center gap-4 p-4"
    >
      {image ? (
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-muted">
          <img 
            src={image} 
            alt={name} 
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-[#FFF9F3] border border-orange-100">
          <span className="text-[10px] font-black uppercase tracking-widest text-primary/60">
            {month}
          </span>
          <span className="text-[22px] font-black leading-tight text-foreground">
            {day}
          </span>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-base font-bold text-foreground">
            {name}
          </h3>
          {isSubscription && (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10">
              <span className="text-[10px]">✨</span>
            </div>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
          <span>₹{price.toLocaleString("en-IN")}</span>
          <div className="h-1 w-1 rounded-full bg-muted-foreground/30" />
          <span className="truncate">{time || "Flexible"}</span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2 shrink-0">
        <div className={cn(
          "rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider",
          status.tone === "success" && "bg-green-100 text-green-700",
          status.tone === "primary" && "bg-orange-100 text-orange-700",
          status.tone === "warning" && "bg-yellow-100 text-yellow-700",
          status.tone === "danger" && "bg-red-100 text-red-700",
          status.tone === "neutral" && "bg-gray-100 text-gray-700",
          status.tone === "brand" && "bg-orange-100 text-orange-700",
          status.tone === "info" && "bg-blue-100 text-blue-700",

        )}>
          {status.label}
        </div>
      </div>
    </Surface>
  );
}
