import { createFileRoute } from "@tanstack/react-router";
import { Calendar } from "lucide-react";

export const Route = createFileRoute("/c/_authed/bookings")({
  ssr: false,
  head: () => ({ meta: [{ title: "My Bookings — Urban Wash" }] }),
  component: () => (
    <div className="px-5 pt-6">
      <h1 className="text-2xl font-semibold tracking-tight">My bookings</h1>
      <div className="mt-8 rounded-3xl border border-dashed p-10 text-center">
        <Calendar className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">No bookings yet.</p>
        <p className="mt-1 text-xs text-muted-foreground">Booking checkout arrives in the next release (Phase 2).</p>
      </div>
    </div>
  ),
});
