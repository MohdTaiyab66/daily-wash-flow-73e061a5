import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/admin/payouts")({
  component: PayoutsPage,
});

function PayoutsPage() {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Payouts</h1>
      <p className="mt-1 text-sm text-muted-foreground">Weekly payout runs (Mondays)</p>
      <Card className="mt-6 p-8 text-center text-sm text-muted-foreground">
        Payout runs will appear here once partners complete services this week.
      </Card>
    </div>
  );
}
