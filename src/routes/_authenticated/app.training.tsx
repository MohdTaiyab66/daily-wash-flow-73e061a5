import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, CheckCircle2, PlayCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/training")({
  component: TrainingPage,
});

function TrainingPage() {
  const { data: modules } = useQuery({
    queryKey: ["training-modules"],
    queryFn: async () => {
      const { data } = await supabase.from("training_modules").select("*").order("sort_order", { ascending: true });
      return data ?? [];
    },
  });

  const { data: progress } = useQuery({
    queryKey: ["training-progress"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("training_progress").select("module_id,completed_at").eq("partner_id", u.user!.id);
      return new Set((data ?? []).filter((p) => p.completed_at).map((p) => p.module_id));
    },
  });

  const completed = (modules ?? []).filter((m) => progress?.has(m.id)).length;
  const total = modules?.length ?? 0;
  const pct = total ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-md px-5 pt-5">
      <h1 className="text-2xl font-semibold tracking-tight">Training Center</h1>
      <p className="mt-1 text-sm text-muted-foreground">SOPs, safety and best practices.</p>

      <Card className="mt-5 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Overall completion</p>
          <p className="text-sm font-semibold">{pct}%</p>
        </div>
        <div className="mt-2 h-2 rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{completed} of {total} modules</p>
      </Card>

      <div className="mt-4 space-y-2">
        {(modules ?? []).map((m) => {
          const done = progress?.has(m.id);
          const isVideo = (m as any).video_url || (m.title ?? "").toLowerCase().includes("video");
          return (
            <Card key={m.id} className="flex items-start gap-3 p-4">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-accent-foreground">
                {isVideo ? <PlayCircle className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{m.title}</p>
                {m.description && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{m.description}</p>}
              </div>
              {done ? (
                <Badge className="border-0 bg-[color:var(--success)]/15 text-[color:var(--success)]">
                  <CheckCircle2 className="mr-1 h-3 w-3" />Done
                </Badge>
              ) : (
                <Badge variant="outline" className="border-dashed text-muted-foreground">Pending</Badge>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
