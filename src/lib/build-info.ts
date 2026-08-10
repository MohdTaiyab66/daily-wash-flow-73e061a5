import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const BUILD_VERSION = "SERVICE-BOOKING-PREMIUM-GALLERY-42";
export const DAILY_SHINE_CAROUSEL_BUCKET = "daily-shine-carousel";

export const getBuildInfo = createServerFn({ method: "GET" })
  .handler(async () => {
    return {
      version: BUILD_VERSION,
      env: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    };
  });

