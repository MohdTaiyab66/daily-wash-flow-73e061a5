import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listServicePhotos } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock } from "lucide-react";

export const Route = createFileRoute("/admin/photos")({
  component: PhotosPage,
});

function PhotosPage() {
  const fn = useServerFn(listServicePhotos);
  const { data } = useQuery({ queryKey: ["admin-photos"], queryFn: () => fn() });

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Photo Verification</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Latest service photos uploaded by partners (5 photos per car: before/after × 4 angles + odometer).
      </p>

      {(!data || data.length === 0) && (
        <Card className="mt-8 p-10 text-center text-sm text-muted-foreground">
          No photos uploaded yet.
        </Card>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(data ?? []).map((p: any) => (
          <Card key={p.id} className="overflow-hidden">
            <div className="flex aspect-square items-center justify-center bg-muted text-xs text-muted-foreground">
              {p.storage_path ? (
                <span className="px-3 text-center break-all">{p.storage_path}</span>
              ) : (
                "No image path"
              )}
            </div>
            <div className="space-y-2 p-4">
              <div className="flex items-center justify-between">
                <Badge variant={p.stage === "after" ? "default" : "secondary"}>{p.stage}</Badge>
                <span className="text-xs text-muted-foreground">{p.angle}</span>
              </div>
              <p className="text-sm font-medium">
                {p.services?.customers?.full_name ?? "—"}{" "}
                <span className="text-xs text-muted-foreground">· {p.services?.customers?.area ?? ""}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Partner: {p.partners?.full_name ?? "—"} ({p.partners?.partner_code ?? "—"})
              </p>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(p.captured_at).toLocaleString()}</span>
                {p.lat && p.lng && (
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{Number(p.lat).toFixed(3)}, {Number(p.lng).toFixed(3)}</span>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
