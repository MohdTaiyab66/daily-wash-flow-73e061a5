import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/customer/AuthProvider";
import { startFcm } from "@/lib/push/fcm";
import { isNative, appVariant } from "@/lib/platform";
import { App as CapApp } from "@capacitor/app";

/**
 * Hook to manage FCM registration lifecycle.
 * Ensures registration happens on:
 * 1. Auth ready
 * 2. App foreground
 * 3. Token refresh (handled inside startFcm)
 */
export function useFcmRegistration() {
  const { user, authStatus } = useAuth();
  const [lastAttempt, setLastAttempt] = useState<number>(0);

  const register = useCallback(async () => {
    if (!user?.id || authStatus !== 'authenticated' || !isNative()) {
      return;
    }

    // Rate limit registration attempts to once per 30 seconds
    const now = Date.now();
    if (now - lastAttempt < 30000) return;
    setLastAttempt(now);

    console.log("[CUSTOMER-FCM-REGISTRATION:01] Triggering registration for:", user.id);
    try {
      await startFcm(user.id, appVariant() as "customer" | "partner");
    } catch (err) {
      console.error("[CUSTOMER-FCM-REGISTRATION:ERR] Registration failed:", err);
    }
  }, [user?.id, authStatus, lastAttempt]);

  useEffect(() => {
    // Initial registration when auth is ready
    if (authStatus === 'authenticated' && user?.id) {
      register();
    }
  }, [authStatus, user?.id, register]);

  useEffect(() => {
    if (!isNative()) return;

    // Re-register when app comes to foreground to ensure token is fresh
    const listener = CapApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        console.log("[CUSTOMER-FCM-REGISTRATION:RETRY] App foregrounded, checking registration...");
        register();
      }
    });

    return () => {
      listener.then(l => l.remove());
    };
  }, [register]);
}
