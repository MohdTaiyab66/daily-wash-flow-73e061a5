import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/admin/offer-delivery/$id")({
  component: OfferDeliveryDetail,
});

const STAGE_LABEL: Record<string, string> = {
  created: "Created",
  queued: "Queued",
  selected: "Partner selected",
  push_sent: "Push sent",
  push_delivered: "Push delivered",
  opened: "Opened",
  popup_displayed: "Popup displayed",
  accepted: "Accepted",
  declined: "Declined",
  timed_out: "Timed out",
  reassigned: "Reassigned",
  completed: "Completed",
  push_failed: "Push failed",
};

function OfferDeliveryDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["offer-delivery", id],
    queryFn: async () => {
      const { data: events, error } = await supabase
        .from("offer_delivery_events" as any)
        .select("id, stage, meta, created_at, partner_id, queue_id")
        .eq("offer_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const { data: offer } = await supabase
        .from("subscription_offers")
        .select("id, queue_id, partner_id, scope, response, offered_at, expires_at, responded_at")
        .eq("id", id)
        .maybeSingle();
      return { events: events ?? [], offer };
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`offer-delivery-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "offer_delivery_events", filter: `offer_id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["offer-delivery", id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, qc]);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link to="/admin/marketplace" className="text-sm text-muted-foreground hover:underline">
        ← Marketplace
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Offer delivery</h1>
      <p className="text-xs text-muted-foreground">Offer ID: {id}</p>

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}

      {data?.offer && (
        <div className="mt-4 rounded-lg border border-border bg-card p-4 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-muted-foreground">Partner</p>
              <p className="font-mono text-xs">{data.offer.partner_id}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Scope</p>
              <p>{data.offer.scope}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Response</p>
              <p className="font-medium capitalize">{data.offer.response}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Expires</p>
              <p>{data.offer.expires_at ? new Date(data.offer.expires_at).toLocaleString() : "—"}</p>
            </div>
          </div>
        </div>
      )}

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Timeline</h2>
      <ol className="mt-2 space-y-2">
        {(data?.events ?? []).map((e: any) => (
          <li key={e.id} className="rounded-md border border-border bg-card p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{STAGE_LABEL[e.stage] ?? e.stage}</span>
              <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
            </div>
            {e.meta && Object.keys(e.meta).length > 0 && (
              <pre className="mt-2 overflow-x-auto rounded bg-muted/50 p-2 text-[11px] leading-snug">
                {JSON.stringify(e.meta, null, 2)}
              </pre>
            )}
          </li>
        ))}
        {!isLoading && (data?.events?.length ?? 0) === 0 && (
          <li className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No events recorded yet.
          </li>
        )}
      </ol>
    </div>
  );
}
