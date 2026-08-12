import { supabase } from "./client";

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

export const parseAuthError = (err: any) => {
  if (!err) return "Unknown authentication error";
  if (typeof err === "string") return err;
  return err.message || JSON.stringify(err);
};
