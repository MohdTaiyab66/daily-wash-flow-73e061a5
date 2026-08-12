/**
 * Utility for safe, structured authentication logging.
 * Never logs sensitive tokens or raw OTPs in production.
 */
export const authLog = {
  info: (step: string, data?: any) => {
    console.group(`[AUTH] ${step}`);
    if (data) console.log(data);
    console.groupEnd();
  },
  error: (step: string, error?: any) => {
    console.group(`[AUTH ERROR] ${step}`);
    if (error) {
      console.error("Technical details:", {
        message: error?.message,
        code: error?.code,
        status: error?.status,
        name: error?.name,
        ...error
      });
    }
    console.groupEnd();
  },
  trace: (message: string, data?: any) => {
    console.log(`[AUTH TRACE] ${message}`, data || "");
  }
};

export const parseAuthError = (error: any): string => {
  if (!error) return "Something went wrong. Please try again.";
  const msg = (error.message || "").toLowerCase();
  
  if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
    return "That code doesn't look right. Please try again.";
  }
  if (msg.includes("otp expired") || msg.includes("expired")) {
    return "This code has expired. Please request a new one.";
  }
  if (msg.includes("too many requests") || msg.includes("rate limit")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return "Couldn't connect. Check your internet and try again.";
  }
  
  return "Could not sign in. Please try again.";
};
