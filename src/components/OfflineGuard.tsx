import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PowerOff, Loader2 } from "lucide-react";
import { usePartner, useToggleOnline } from "@/hooks/use-partner";
import { toast } from "sonner";

export function OfflineGuard({ children, label = "this section" }: { children: React.ReactNode; label?: string }) {
  const { data: partner, isLoading } = usePartner();
  const toggle = useToggleOnline();

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-md items-center justify-center px-5 py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (partner?.availability === "online") return <>{children}</>;

  return (
    <div className="mx-auto max-w-md px-5 pt-5">
      <Card className="flex flex-col items-center gap-4 p-8 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-muted">
          <PowerOff className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="text-lg font-semibold">You're offline</p>
          <p className="mt-1 text-sm text-muted-foreground">Go online to access {label}.</p>
        </div>
        <Button
          onClick={async () => {
            try {
              await toggle(true);
              toast.success("You are Online");
            } catch (e: any) {
              toast.error(e?.message || "Could not go online. Please try again.");
            }
          }}
          className="w-full"
        >
          Go online
        </Button>
      </Card>
    </div>
  );
}
