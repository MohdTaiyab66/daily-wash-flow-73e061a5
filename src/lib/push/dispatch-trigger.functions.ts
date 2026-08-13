import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { dispatchCustomerNotifications } from "./dispatch.server";

/**
 * Triggers the customer notification dispatcher.
 * Used for testing production notification flows after a service completion.
 */
export const triggerCustomerDispatch = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ userId: z.string().optional() }).parse(data))
  .handler(async () => {
    console.log("[CUSTOMER-PROD-E2E:TRIGGER] Manual dispatch trigger received");
    const sentCount = await dispatchCustomerNotifications();
    return { success: true, sentCount };
  });
