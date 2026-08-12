import { supabase } from "@/integrations/supabase/client";

export const authLog = {
  trace: (msg: string, data?: any) => {
    console.log(`[TRACE] ${msg}`, data || "");
  },
  info: (msg: string, data?: any) => {
    console.log(`[INFO] ${msg}`, data || "");
  },
  warn: (msg: string, data?: any) => {
    console.warn(`[WARN] ${msg}`, data || "");
  },
  error: (msg: string, data?: any) => {
    console.error(`[ERROR] ${msg}`, data || "");
  },
};

export const parseAuthError = (err: any): string => {
  if (!err) return "Unknown authentication error";
  if (typeof err === "string") return err;
  
  // Handle Error objects or Supabase error objects
  const message = err.message || err.error_description || err.error || null;
  const code = err.code || err.error_code || null;
  const status = err.status || err.statusCode || null;

  if (message) {
    let detail = message;
    if (code) detail += ` (Code: ${code})`;
    if (status) detail += ` [Status: ${status}]`;
    return detail;
  }

  // Fallback for objects that don't have standard properties but aren't empty
  try {
    const str = JSON.stringify(err);
    if (str !== "{}" && str !== "null") return str;
  } catch (e) {
    // ignore stringify errors
  }

  return "An unspecified authentication error occurred";
};

export function getAuthErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      code: (error as any).code ?? null,
      status: (error as any).status ?? null,
    };
  }
  if (typeof error === "object" && error !== null) {
    const e = error as any;
    return {
      message: e.message ?? e.error_description ?? e.error ?? "Unknown authentication error",
      name: e.name ?? null,
      code: e.code ?? e.error_code ?? null,
      status: e.status ?? e.statusCode ?? null,
    };
  }
  return {
    message: String(error ?? "Unknown authentication error"),
    name: null,
    code: null,
    status: null,
  };
}

export async function diagnoseSession() {
  const { data, error } = await supabase.auth.getSession();
  console.log("[AUTH-P0] DIRECT GET SESSION");
  console.log("error:", error?.message);
  console.log("hasSession:", !!data.session);
  console.log("hasUser:", !!data.session?.user);
  console.log("userId:", data.session?.user?.id ?? null);
  return { 
    error: error?.message, 
    hasSession: !!data.session, 
    userId: data.session?.user?.id,
    email: data.session?.user?.email
  };
}


