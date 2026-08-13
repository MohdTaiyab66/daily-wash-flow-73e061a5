import { useEffect } from "react";
import { startFcm } from "./fcm";

/**
 * Mount this once inside an authenticated layout. It registers the current
 * user for FCM on native, and is a no-op on the web. Safe to remount.
 */
export function useFcmRegistration(userId: string | null | undefined, app: "partner" | "customer") {
  useEffect(() => {
    if (!userId) {
      console.log("[CUSTOMER-FCM-REGISTRATION] No userId available in useFcmRegistration");
      return;
    }

    const runRegistration = async () => {
      console.log(`[CUSTOMER-FCM-REGISTRATION] Triggering startFcm for user ${userId}`);
      try {
        await startFcm(userId, app);
      } catch (err) {
        console.error("[CUSTOMER-FCM-REGISTRATION:ERR] startFcm failed:", err);
      }
    };

    runRegistration();

    // Re-register when app comes to foreground to ensure token is fresh
    if (typeof window !== 'undefined') {
      const handleFocus = () => {
        console.log("[CUSTOMER-FCM-REGISTRATION] Window focused, checking FCM...");
        runRegistration();
      };
      window.addEventListener('focus', handleFocus);
      return () => window.removeEventListener('focus', handleFocus);
    }
  }, [userId, app]);
}

