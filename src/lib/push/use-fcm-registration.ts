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
    console.log(`[CUSTOMER-FCM-REGISTRATION] Triggering startFcm for user ${userId}`);
    void startFcm(userId, app);
  }, [userId, app]);
}
