import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPushDiagnostics, sendDirectTestPush } from "@/lib/push/diagnostics.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShieldCheck, RefreshCcw, Send, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export function PushDiagnosticsPanel() {
  const getDiags = useServerFn(getPushDiagnostics);
  const sendTest = useServerFn(sendDirectTestPush);
  const [isTesting, setIsTesting] = useState(false);

  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ["push-diagnostics"],
    queryFn: () => getDiags(),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      setIsTesting(true);
      return sendTest({ data: { targetUserId: data?.user_id! } });
    },
    onSuccess: (res) => {
      if (res.sent > 0) {
        toast.success(`Sent ${res.sent} test notification(s)`);
      } else {
        toast.error("Failed to send: No active tokens or FCM error");
      }
    },
    onError: (err) => {
      toast.error(`Test failed: ${err.message}`);
    },
    onSettled: () => setIsTesting(false),
  });

  if (isLoading) return <div className="p-4 text-center">Loading diagnostics...</div>;
  if (error) return <div className="p-4 text-destructive">Error: {error.message}</div>;

  const hasTokens = data?.tokens && data.tokens.length > 0;
  const configOk = data?.firebase_config?.project_id !== "MISSING" && data?.firebase_config?.has_private_key;

  return (
    <Card className="border-2 border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Push Notification Forensic Panel
            </CardTitle>
            <div className="text-[10px] space-y-0.5 mt-1 font-mono text-muted-foreground uppercase">
              <div>AUTH: <span className={data?.user_id ? "text-success" : "text-destructive"}>{data?.user_id ? "READY" : "NOT READY"}</span></div>
              <div>PERMISSION: <span className={data?.tokens?.length ? "text-success" : ""}>{data?.tokens?.length ? "GRANTED" : "CHECK APP"}</span></div>
              <div>FCM: <span className={data?.tokens?.length ? "text-success" : ""}>{data?.tokens?.length ? "INITIALIZED" : "PENDING"}</span></div>
              <div>BACKEND: <span className={data?.tokens?.length ? "text-success" : ""}>{data?.tokens?.length ? "SUCCESS" : "WAITING"}</span></div>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => refetch()}>
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Firebase Config */}
        <div className="rounded-lg bg-background p-3 text-xs border">
          <p className="font-bold text-muted-foreground uppercase mb-2">Backend Config</p>
          <div className="grid grid-cols-2 gap-2">
            <div>Project: <span className="font-mono">{data?.firebase_config?.project_id}</span></div>
            <div className="flex items-center gap-1">
              Auth: {configOk ? <CheckCircle2 className="h-3 w-3 text-success" /> : <AlertTriangle className="h-3 w-3 text-destructive" />}
            </div>
            <div className="col-span-2">Email: <span className="font-mono text-[10px]">{data?.firebase_config?.client_email}</span></div>
          </div>
        </div>

        {/* Tokens */}
        <div className="rounded-lg bg-background p-3 text-xs border">
          <p className="font-bold text-muted-foreground uppercase mb-2">Active Tokens ({data?.tokens?.length || 0})</p>
          {hasTokens ? (
            <div className="space-y-2">
              {data.tokens.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between p-2 rounded border bg-muted/50">
                  <div>
                    <div className="font-bold uppercase text-[10px]">{t.platform} • {t.app}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">ID: {data.user_id?.slice(0, 8)}... | {t.token_tail}</div>

                  </div>
                  <div className="text-[9px] text-right">
                    Seen: {new Date(t.last_seen).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 p-2 rounded border border-destructive/20 bg-destructive/5 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span>NO ACTIVE FCM TOKENS FOUND</span>
            </div>
          )}
        </div>

        {/* Test Trigger */}
        <Button 
          className="w-full font-bold" 
          disabled={!hasTokens || isTesting}
          onClick={() => testMutation.mutate()}
        >
          {isTesting ? <RefreshCcw className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
          SEND DIRECT TEST PUSH
        </Button>
      </CardContent>
    </Card>
  );
}
