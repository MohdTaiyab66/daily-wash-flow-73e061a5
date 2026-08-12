import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type AuthStatus = 'initializing' | 'authenticated' | 'unauthenticated' | 'error';

interface AuthContextType {
  authStatus: AuthStatus;
  session: any | null;
  user: any | null;
}

const AuthContext = createContext<AuthContextType>({
  authStatus: 'initializing',
  session: null,
  user: null,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthContextType>({
    authStatus: 'initializing',
    session: null,
    user: null,
  });

  useEffect(() => {
    let mounted = true;

    const updateState = (session: any | null) => {
      if (!mounted) return;
      setState({
        authStatus: session ? 'authenticated' : 'unauthenticated',
        session,
        user: session?.user ?? null,
      });
    };

    // Initial check
    supabase.auth.getSession().then(({ data: { session } }) => {
      updateState(session);
    });

    // Subscribe
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      updateState(session);
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
