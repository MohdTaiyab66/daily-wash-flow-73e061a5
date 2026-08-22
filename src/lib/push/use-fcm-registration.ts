import { useEffect, useRef } from "react";
import { startFcm } from "./fcm";

/**
 * Mount this once inside an authenticated layout. It registers the current
 * user for FCM on native, and is a no-op on the web. Safe to remount.
 */
export function useFcmRegistration(userId: string | null | undefined, app: "partner" | "customer") {
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      console.log("[CUSTOMER-FCM-REGISTRATION] No userId available in useFcmRegistration");
      lastUserIdRef.current = null;
      return;
    }

    const runRegistration = async () => {
      // P0 FIX: Only re-register if user actually changed or explicitly requested
      if (lastUserIdRef.current === userId) {
        console.log(`[PARTNER-FCM] userId ${userId} already registered for this session lifecycle.`);
        return;
      }

      console.log(`[PARTNER-FCM] Hook mounted/focused. Triggering startFcm for user ${userId}`);
      try {
        await startFcm(userId, app);
        lastUserIdRef.current = userId;
      } catch (err) {
        console.error("[PARTNER-FCM] startFcm fatal error:", err);
      }
    };

    runRegistration();

    // Re-register when app comes to foreground to ensure token is fresh
    if (typeof window !== 'undefined') {
      const handleFocus = () => {
        console.log("[CUSTOMER-FCM-REGISTRATION] Window focused, checking FCM...");
        // On focus, we might want to ensure token is still correct even for same user
        // but let's keep it lean for multi-account testing
        runRegistration();
      };
      window.addEventListener('focus', handleFocus);
      return () => window.removeEventListener('focus', handleFocus);
    }
  }, [userId, app]);
}

