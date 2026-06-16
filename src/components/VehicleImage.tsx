import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Car } from "lucide-react";

/** Renders a vehicle's front image from the private vehicle-images bucket using a signed URL. */
export function VehicleImage({
  path,
  className = "",
  alt = "Vehicle",
}: {
  path?: string | null;
  className?: string;
  alt?: string;
}) {
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
      <div className={`flex items-center justify-center bg-muted ${className}`}>
        <Car className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }
  if (!url) {
    return <div className={`bg-muted ${className}`} />;
  }
  return <img src={url} alt={alt} className={`object-cover ${className}`} />;
}
