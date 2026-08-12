import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { authLog } from "@/lib/auth-debug";

type AuthStatus = 'initializing' | 'authenticated' | 'unauthenticated' | 'error';

interface AuthContextType {
  authStatus: AuthStatus;
  session: any | null;
  user: any | null;
  clientId: string;
}

const AuthContext = createContext<AuthContextType>({
  authStatus: 'initializing',
  session: null,
  user: null,
  clientId: '',
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthContextType>({
    authStatus: 'initializing',
    session: null,
    user: null,
    clientId: (window as any).__SUPABASE_CLIENT_ID || 'unknown',
  });

  useEffect(() => {
    let mounted = true;

    const updateState = async (event: string, session: any | null) => {
      // Use the window ID primarily to ensure we catch it after it is initialized
      const clientId = (window as any).__SUPABASE_CLIENT_ID || 'initializing';
      
      authLog.info(`[AUTH-SYNC] EVENT: ${event}`, { 
        hasSession: !!session, 
        userId: session?.user?.id ?? null,
        clientId
      });

      if (!mounted) return;

      setState(prev => ({
        ...prev,
        authStatus: session ? 'authenticated' : 'unauthenticated',
        session,
        user: session?.user ?? null,
        clientId: clientId
      }));
    };

    // IMMEDIATE: Try to get client ID if it's already set on window
    if ((window as any).__SUPABASE_CLIENT_ID) {
      setState(prev => ({ ...prev, clientId: (window as any).__SUPABASE_CLIENT_ID }));
    }

    // Initial check
    supabase.auth.getSession().then(({ data: { session } }) => {
      updateState('INITIAL_SESSION_CHECK', session);
    });

    // Subscribe
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      updateState(event, session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={state}>
      {children}
    </AuthContext.Provider>
  );
}
