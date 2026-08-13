import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPushDiagnostics, sendDirectTestPush } from "@/lib/push/diagnostics.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShieldCheck, RefreshCcw, Send, AlertTriangle, CheckCircle2, Smartphone, Terminal } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export function PushDiagnosticsPanel() {
  const getDiags = useServerFn(getPushDiagnostics);
  const sendTest = useServerFn(sendDirectTestPush);
  const [isTesting, setIsTesting] = useState(false);
  const [lastTestResult, setLastTestResult] = useState<any>(null);
  const [nativeState, setNativeState] = useState<any>(null);

  // Poll native SharedPreferences via Capacitor bridge
  useEffect(() => {
    // Safety check for platform
    let platform = 'web';
    try {
      platform = Capacitor.getPlatform();
    } catch (e) {
      console.warn("[CUSTOMER-PUSH-NATIVE-DIAG] Platform check failed", e);
    }

    if (platform !== 'android') return;

    const checkNative = async () => {
      try {
        // Safe access to Capacitor.Plugins
        const Plugins = (window as any).Capacitor?.Plugins;
        const Preferences = Plugins?.Preferences;
        
        if (!Preferences) return;

        // The Capacitor Preferences plugin reads from the "CapacitorStorage" SharedPreferences by default.
        // We use .get() which returns { value: string | null }
        const results = await Promise.all([
          Preferences.get({ key: 'last_fcm_message_id' }).catch(() => ({ value: null })),
          Preferences.get({ key: 'last_fcm_received_at' }).catch(() => ({ value: null })),
          Preferences.get({ key: 'last_fcm_type' }).catch(() => ({ value: null })),
          Preferences.get({ key: 'last_fcm_title' }).catch(() => ({ value: null })),
          Preferences.get({ key: 'last_notif_posted_id' }).catch(() => ({ value: null })),
          Preferences.get({ key: 'last_notif_posted_at' }).catch(() => ({ value: null }))
        ]);
        
        const lastMsgId = results[0]?.value;
        const lastReceivedAt = results[1]?.value;
        const lastType = results[2]?.value;
        const lastTitle = results[3]?.value;
        const lastNotifId = results[4]?.value;
        const lastNotifAt = results[5]?.value;

        if (lastMsgId) {
          setNativeState({
            fcm: {
              id: lastMsgId,
              receivedAt: lastReceivedAt ? new Date(parseInt(lastReceivedAt)).toLocaleTimeString() : 'N/A',
              type: lastType || 'unknown',
              title: lastTitle || ''
            },
            notif: {
              id: lastNotifId,
              postedAt: lastNotifAt ? new Date(parseInt(lastNotifAt)).toLocaleTimeString() : 'N/A'
            }
          });
        }
      } catch (e) {
        console.error("[CUSTOMER-PUSH-NATIVE-DIAG] Native check failed", e);
      }
    };

    const timer = setInterval(checkNative, 2000);
    return () => clearInterval(timer);
  }, []);

  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ["push-diagnostics"],
    queryFn: () => getDiags(),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      setIsTesting(true);
      setLastTestResult({ status: "SENDING..." });
      
      const targetUserId = data?.user_id;
      if (!targetUserId) throw new Error("User ID missing");
      return sendTest({ data: { targetUserId } });
    },
    onSuccess: (res: any) => {
      const firstRes = res.results?.[0];
      setLastTestResult({
        status: res.sent > 0 ? "FCM SERVER ACCEPTED" : "FCM FAILED",
        userId: data?.user_id?.slice(0, 8),
        tokenTail: res.tokenTail,
        projectId: res.projectId,
        messageId: firstRes?.messageId || "N/A",
        sentAt: new Date(res.sentAt).toLocaleTimeString(),
        result: res.sent > 0 ? "SUCCESS" : `ERROR: ${firstRes?.errorCode || "Unknown"}`,
        raw: res
      });

      if (res.sent > 0) {
        toast.success(`FCM accepted test notification`);
      } else {
        toast.error(`FCM Failed: ${firstRes?.errorCode || "No tokens"}`);
      }
    },
    onError: (err) => {
      setLastTestResult({ status: "FCM FAILED", result: err.message });
      toast.error(`Test failed: ${err.message}`);
    },
    onSettled: () => setIsTesting(false),
  });

  if (isLoading) return <div className="p-4 text-center text-[10px] font-mono opacity-40 uppercase tracking-widest">Forensic Panel Loading...</div>;
  if (error) return <div className="p-4 text-destructive border-2 border-destructive/20 bg-destructive/5 rounded-2xl text-[10px] font-mono leading-tight">FORENSIC ERROR: {error.message}</div>;

  const hasTokens = data?.tokens && data.tokens.length > 0;
  const configOk = data?.firebase_config?.project_id !== "MISSING" && data?.firebase_config?.has_private_key;

  return (
    <Card className="border border-black/5 bg-white shadow-sm rounded-2xl overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Push Notification Forensic Panel
            </CardTitle>
            <div className="text-[10px] space-y-0.5 mt-1 font-mono text-muted-foreground uppercase">
              <div>AUTH: <span className={data?.user_id ? "text-success" : "text-destructive"}>{data?.user_id ? "READY" : "NOT READY"}</span></div>
              <div>PERMISSION: <span className={data?.tokens?.length ? "text-success" : ""}>{data?.tokens?.length ? "GRANTED" : "UNKNOWN"}</span></div>
              <div>FCM: <span className={data?.tokens?.length ? "text-success" : ""}>{data?.tokens?.length ? "INITIALIZED" : "UNKNOWN"}</span></div>
              <div>BACKEND: <span className={data?.tokens?.length ? "text-success" : ""}>{data?.tokens?.length ? "SUCCESS" : "UNKNOWN"}</span></div>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => refetch()}>
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Firebase Config */}
        <div className="rounded-xl bg-muted/30 p-3 border border-black/5">
          <p className="font-bold text-[10px] text-muted-foreground uppercase mb-2 tracking-widest">Backend Config</p>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div>Project: <span className="font-mono text-primary">{data?.firebase_config?.project_id}</span></div>
            <div className="flex items-center gap-1">
              Auth: {configOk ? <CheckCircle2 className="h-3 w-3 text-success" /> : <AlertTriangle className="h-3 w-3 text-destructive" />}
            </div>
            <div className="col-span-2 text-[9px] opacity-60">Email: <span className="font-mono">{data?.firebase_config?.client_email}</span></div>
          </div>
        </div>

        {/* Tokens */}
        <div className="rounded-xl bg-muted/30 p-3 border border-black/5">
          <p className="font-bold text-[10px] text-muted-foreground uppercase mb-2 tracking-widest">Active Tokens ({data?.tokens?.length || 0})</p>
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
          className="w-full font-black rounded-xl h-12 shadow-md active:scale-[0.98] transition-transform" 
          disabled={!hasTokens || isTesting}
          onClick={() => testMutation.mutate()}
        >
          {isTesting ? <RefreshCcw className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
          SEND DIRECT TEST PUSH
        </Button>

        {/* STEP 7 & 11: DETAILED RESULT PANEL */}
        {lastTestResult && (
          <div className="rounded-2xl bg-black text-white p-4 text-[10px] border border-orange-500/30 font-mono mt-4 shadow-xl">
            <p className="font-bold text-orange-500 uppercase mb-3 border-b border-white/10 pb-2 flex justify-between items-center">
              <span className="flex items-center gap-2"><Smartphone className="h-3 w-3" /> DIRECT TEST RESULT</span>
              <span className="text-[8px] text-white/30 font-normal">BUILD: FCM-P0-ANDROID-RECEIPT-02</span>
            </p>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>FCM SERVER:</span>
                <span className={lastTestResult.result === "SUCCESS" ? "text-green-400 font-bold" : "text-red-400"}>
                  {lastTestResult.result === "SUCCESS" ? "✅ ACCEPTED" : lastTestResult.result}
                </span>
              </div>
              <div className="flex justify-between">
                <span>PROJECT:</span>
                <span className="text-blue-300">{lastTestResult.projectId || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span>SERVER MSG ID:</span>
                <span className="truncate max-w-[140px] text-yellow-200">{lastTestResult.messageId || "—"}</span>
              </div>
              
              <div className="pt-2 border-t border-white/10 mt-1">
                <p className="text-orange-400 font-bold mb-1 underline">ANDROID NATIVE HANDSHAKE</p>
                
                {nativeState?.fcm?.id === lastTestResult.messageId ? (
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>ANDROID FCM:</span>
                      <span className="text-green-400 font-bold">✅ RECEIVED</span>
                    </div>
                    <div className="flex justify-between">
                      <span>NATIVE MSG ID:</span>
                      <span className="truncate max-w-[140px] text-green-300">{nativeState.fcm.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>RECEIVED AT:</span>
                      <span>{nativeState.fcm.receivedAt}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>TYPE:</span>
                      <span className="text-blue-300">{nativeState.fcm.type}</span>
                    </div>
                    
                    <div className="flex justify-between pt-1">
                      <span>NOTIFICATION:</span>
                      <span className={nativeState.notif?.id ? "text-green-400 font-bold" : "text-orange-400"}>
                        {nativeState.notif?.id ? "✅ POSTED" : "⏳ POSTING..."}
                      </span>
                    </div>
                    {nativeState.notif?.postedAt && (
                      <div className="flex justify-between">
                        <span>POSTED AT:</span>
                        <span>{nativeState.notif.postedAt}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>ANDROID FCM:</span>
                      <span className="text-orange-400 animate-pulse uppercase font-bold">⏳ WAITING...</span>
                    </div>
                    <p className="text-[8px] text-white/30 mt-1 italic">
                      If stuck here, message is NOT reaching Android service. Check Firebase Project / App ID.
                    </p>
                  </div>
                )}
              </div>
              
              <div className="pt-2 border-t border-white/10 mt-1">
                <p className="text-white/40 font-bold mb-1">APK CONFIG (LIVE)</p>
                <div className="grid grid-cols-2 gap-x-2 opacity-60">
                  <span>PACKAGE:</span>
                  <span>com.urbanwash.customer</span>
                  <span>SENDER ID:</span>
                  <span>781422718869</span>
                  <span>PROJECT:</span>
                  <span>uw-partner-app</span>
                </div>
              </div>
              
              <div className="pt-2 border-t border-white/10 mt-1 flex justify-between items-center">
                <span className="font-bold">FINAL STATUS:</span>
                {nativeState?.fcm?.id === lastTestResult.messageId && nativeState?.notif?.id ? (
                  <span className="bg-green-600 px-2 py-0.5 rounded text-white font-bold animate-bounce">DIRECT TEST: PASS</span>
                ) : (
                  <span className="bg-orange-600 px-2 py-0.5 rounded text-white font-bold animate-pulse">DIRECT TEST: PENDING</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 11: LAST RECEIVED FCM (HISTORICAL) */}
        {!lastTestResult && nativeState?.fcm && (
          <div className="rounded-lg bg-muted p-3 text-[10px] font-mono border">
             <p className="font-bold text-muted-foreground uppercase mb-2 border-b pb-1">LAST FCM ON THIS DEVICE</p>
             <div className="space-y-1">
               <div className="flex justify-between"><span>MSG ID:</span><span className="truncate max-w-[120px]">{nativeState.fcm.id}</span></div>
               <div className="flex justify-between"><span>TYPE:</span><span>{nativeState.fcm.type}</span></div>
               <div className="flex justify-between"><span>RECEIVED:</span><span>{nativeState.fcm.receivedAt}</span></div>
               {nativeState.notif?.postedAt && (
                 <div className="flex justify-between border-t border-muted-foreground/10 pt-1 mt-1">
                   <span>POSTED:</span><span>{nativeState.notif.postedAt}</span>
                 </div>
               )}
             </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
