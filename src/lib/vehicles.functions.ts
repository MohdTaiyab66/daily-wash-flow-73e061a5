import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Validates and updates a vehicle's image path.
 * This is a secure server-side function to handle DB updates
 * after a successful storage upload.
 */
export const updateVehicleImage = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        vehicleId: z.string().uuid(),
        imagePath: z.string().min(1),
      })
      .parse(data)
  )
  .handler(async ({ data, request }) => {
    // 1. Get user session to verify ownership
    const { data: { user } } = await supabaseAdmin.auth.getUser(
      request.headers.get("Authorization")?.split(" ")[1] ?? ""
    );

    if (!user) {
      throw new Error("Unauthorized");
    }

    // 2. Verify the vehicle belongs to this user
    const { data: vehicle, error: fetchErr } = await supabaseAdmin
      .from("customer_vehicles")
      .select("user_id, image_path")
      .eq("id", data.vehicleId)
      .single();

    if (fetchErr || !vehicle) {
      throw new Error("Vehicle not found");
    }

    if (vehicle.user_id !== user.id) {
      throw new Error("Forbidden: You do not own this vehicle");
    }

    // 3. Update the path
    const { error: updateErr } = await supabaseAdmin
      .from("customer_vehicles")
      .update({ image_path: data.imagePath })
      .eq("id", data.vehicleId);

    if (updateErr) {
      throw new Error(`Failed to update vehicle image: ${updateErr.message}`);
    }

    // 4. Cleanup old photo if it exists (Optional but recommended)
    // This part is usually handled by the client-side mutation for simplicity in this project's pattern
    
    return { success: true, path: data.imagePath };
  });
