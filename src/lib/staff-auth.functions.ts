import { createServerFn } from "@tanstack/react-start";

type StaffRole = "admin" | "partner";

const STAFF_DOMAIN: Record<StaffRole, string> = {
  admin: "admin.urbanwash.app",
  partner: "partner.urbanwash.app",
};

const staffEmail = (phone: string, role: StaffRole) => `${phone}@${STAFF_DOMAIN[role]}`;
const staffPassword = (phone: string) => `UWP@${phone}#2026`;

function normalizeStaffInput(input: unknown) {
  const data = (input ?? {}) as { phone?: unknown; otp?: unknown; fullName?: unknown; role?: unknown };
  const phone = String(data.phone ?? "").replace(/\D/g, "");
  const otp = String(data.otp ?? "").trim();
  const fullName = String(data.fullName ?? "").trim();
  const role = data.role === "admin" ? "admin" : data.role === "partner" ? "partner" : null;

  if (!/^\d{10}$/.test(phone)) throw new Error("Enter a valid 10-digit phone");
  if (otp !== "1234") throw new Error("Invalid OTP. Use 1234");
  if (!role) throw new Error("Invalid login type");
  if (role === "partner" && fullName.length < 2) throw new Error("Enter your full name");

  return { phone, otp, fullName, role } as { phone: string; otp: string; fullName: string; role: StaffRole };
}

async function findAuthUserByEmail(supabaseAdmin: any, email: string) {
  const target = email.toLowerCase();

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const found = data?.users?.find((user: any) => String(user.email ?? "").toLowerCase() === target);
    if (found) return found;
    if (!data?.users || data.users.length < 1000) break;
  }

  return null;
}

async function findAuthUsersByPhone(supabaseAdmin: any, phone: string) {
  const matches: any[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    for (const user of data?.users ?? []) {
      const metaPhone = String(user.user_metadata?.phone ?? user.raw_user_meta_data?.phone ?? "").replace(/\D/g, "");
      const emailPhone = String(user.email ?? "").split("@")[0].replace(/\D/g, "");
      if (metaPhone === phone || emailPhone === phone) matches.push(user);
    }
    if (!data?.users || data.users.length < 1000) break;
  }
  return matches;
}

export const prepareStaffLogin = createServerFn({ method: "POST" })
  .inputValidator(normalizeStaffInput)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const email = staffEmail(data.phone, data.role);
    const password = staffPassword(data.phone);
    const userMetadata = {
      full_name: data.fullName || (data.role === "admin" ? "Admin" : null),
      phone: data.phone,
      role: data.role,
    };

    let user = await findAuthUserByEmail(supabaseAdmin, email);

    if (!user) {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: userMetadata,
      });
      if (error) throw new Error(error.message);
      user = created.user;
    } else {
      const { data: updated, error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password,
        email_confirm: true,
        user_metadata: { ...(user.user_metadata ?? {}), ...userMetadata },
      });
      if (error) throw new Error(error.message);
      user = updated.user ?? user;
    }

    if (!user?.id) throw new Error("Could not prepare login. Please try again.");

    if (data.role === "admin") {
      const { data: adminRoles, error: adminRolesError } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      if (adminRolesError) throw new Error(adminRolesError.message);

      const existingAdminIds = new Set((adminRoles ?? []).map((row: { user_id: string }) => row.user_id));
      const samePhoneUsers = await findAuthUsersByPhone(supabaseAdmin, data.phone);
      const samePhoneHasAdmin = samePhoneUsers.some((samePhoneUser) => existingAdminIds.has(samePhoneUser.id));
      const thisUserHasAdmin = existingAdminIds.has(user.id);

      if (existingAdminIds.size > 0 && !samePhoneHasAdmin && !thisUserHasAdmin) {
        throw new Error("Admin access is not enabled for this phone");
      }
    }

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: user.id, role: data.role }, { onConflict: "user_id,role" });
    if (roleError) throw new Error(roleError.message);

    if (data.role === "partner") {
      const partnerPayload = {
        id: user.id,
        full_name: data.fullName,
        phone: data.phone,
        email,
        updated_at: new Date().toISOString(),
      };
      const { error: partnerError } = await supabaseAdmin
        .from("partners")
        .upsert(partnerPayload, { onConflict: "id" });
      if (partnerError) throw new Error(partnerError.message);
    }

    return { email };
  });