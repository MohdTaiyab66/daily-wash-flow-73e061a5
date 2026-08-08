import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
// We don't import supabaseAdmin here to avoid build issues if it's not correctly set up for functions
// Instead we'll rely on the client-side mutation pattern already established in EditVehicleInline.tsx

export const validateImagePath = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({
      path: z.string().min(1),
    }).parse(data)
  )
  .handler(async ({ data }) => {
    // Basic server-side validation of the path format if needed
    if (!data.path.includes("/")) {
      throw new Error("Invalid image path format");
    }
    return { valid: true };
  });
