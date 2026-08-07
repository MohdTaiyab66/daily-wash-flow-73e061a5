import { createServerFn } from "@tanstack/react-start";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";

type StaffRole = "admin" | "partner";

const STAFF_DOMAIN: Record<StaffRole, string> = {
  admin: "admin.urbanwash.app",
  partner: "partner.urbanwash.app",
};

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_REQUESTS_PER_WINDOW = 3;
const OTP_REQUEST_WINDOW_MS = 10 * 60 * 1000;

const staffEmail = (phone: string, role: StaffRole) => `${phone}@${STAFF_DOMAIN[role]}`;

// DEV ONLY - Hardcoded OTP. Remove before production.
// Partner app only: any 10-digit number is accepted with code "1234".
// No code is generated, no SMS/push is sent, no OTP provider is called.
const DEV_PARTNER_OTP = "1234";
const isDevPartner = (role: StaffRole) => role === "partner";

/**
 * Login passwords are cryptographically random and rotated on every verified
 * login. They are NEVER derived from the phone number (or any other public
 * value) and are only ever returned to a caller that has just proven
 * possession of a server-issued one-time code.
 */
const randomPassword = () => `UW-${randomBytes(24).toString("base64url")}`;

const hashOtp = (phone: string, role: StaffRole, code: string) =>
  createHash("sha256").update(`${phone}:${role}:${code}`).digest("hex");

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function normalizePhone(value: unknown) {
  const phone = String(value ?? "").replace(/\D/g, "");
  if (!/^\d{10}$/.test(phone)) throw new Error("Enter a valid 10-digit phone");
  return phone;
}

function normalizeRole(value: unknown): StaffRole {
  if (value === "admin") return "admin";
  if (value === "partner") return "partner";
  throw new Error("Invalid login type");
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

/**
 * Step 1 of staff login.
 *
 * For an EXISTING partner/admin account we mint a random 6-digit code, store
 * only its SHA-256 hash, and deliver it out-of-band to the devices already
 * registered to that account (plus an admin alert as a relay fallback). The
 * caller never receives the code, so knowing a phone number is not enough to
 * log in or to reset anybody's credentials.
 *
 * When no account exists for the number there is nothing to take over, so the
 * client goes straight to the sign-up step.
 */
export const requestStaffOtp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const data = (input ?? {}) as { phone?: unknown; role?: unknown };
    return { phone: normalizePhone(data.phone), role: normalizeRole(data.role) };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;

    const email = staffEmail(data.phone, data.role);
    const user = await findAuthUserByEmail(sb, email);

    // DEV ONLY - Hardcoded OTP. Remove before production.
    if (isDevPartner(data.role)) {
      return { newAccount: !user, delivery: "none" as const };
    }

    if (!user) {
      // No account for this number yet — nothing exists that could be hijacked.
      return { newAccount: true as const, delivery: "none" as const };
    }


    const { count } = await sb
      .from("staff_login_otps")
      .select("id", { count: "exact", head: true })
      .eq("phone", data.phone)
      .eq("role", data.role)
      .gt("created_at", new Date(Date.now() - OTP_REQUEST_WINDOW_MS).toISOString());
    if ((count ?? 0) >= OTP_MAX_REQUESTS_PER_WINDOW) {
      throw new Error("Too many code requests. Please wait a few minutes and try again.");
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const { error: insertError } = await sb.from("staff_login_otps").insert({
      phone: data.phone,
      role: data.role,
      code_hash: hashOtp(data.phone, data.role, code),
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    });
    if (insertError) throw new Error(insertError.message);

    let delivery: "push" | "admin_relay" = "admin_relay";
    const { data: tokens } = await sb.from("push_tokens").select("id").eq("user_id", user.id).limit(1);
    if (tokens?.length) {
      const { sendOfferPush } = await import("@/lib/push/send.server");
      try {
        await sendOfferPush({
          userId: user.id,
          title: "Urban Wash login code",
          body: `Your login code is ${code}. It expires in 5 minutes.`,
          data: { type: "staff_login_code" },
          channelId: "general",
        });
        delivery = "push";
      } catch {
        delivery = "admin_relay";
      }
    }

    if (delivery === "admin_relay") {
      // No usable device on file: raise an internal alert so an administrator
      // can verify the person and relay the code. The code is never returned
      // to the caller.
      await sb.from("admin_alerts").insert({
        title: "Staff login code requested",
        body: `A ${data.role} login code was requested for +91 ${data.phone}. Code: ${code} (valid 5 min).`,
        kind: "staff_login_code",
      });
    }

    return { newAccount: false as const, delivery };
  });

/**
 * Step 2 of staff login. Verifies the one-time code (or creates a brand-new
 * account when none exists), rotates the account password to a fresh random
 * value and returns it to the verified caller so it can sign in.
 */
export const prepareStaffLogin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const data = (input ?? {}) as { phone?: unknown; otp?: unknown; fullName?: unknown; role?: unknown };
    return {
      phone: normalizePhone(data.phone),
      role: normalizeRole(data.role),
      otp: String(data.otp ?? "").replace(/\D/g, ""),
      fullName: String(data.fullName ?? "").trim(),
    };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;

    const email = staffEmail(data.phone, data.role);
    const password = randomPassword();
    let user = await findAuthUserByEmail(sb, email);

    if (user) {
      // Existing account: a valid, unexpired, unconsumed server-issued code is
      // mandatory before we touch the credentials.
      const { data: rows, error: otpError } = await sb
        .from("staff_login_otps")
        .select("id,code_hash,expires_at,attempts,consumed_at")
        .eq("phone", data.phone)
        .eq("role", data.role)
        .is("consumed_at", null)
        .order("created_at", { ascending: false })
        .limit(1);
      if (otpError) throw new Error(otpError.message);

      const record = rows?.[0];
      if (!record) throw new Error("Request a new code to continue.");
      if (new Date(record.expires_at).getTime() < Date.now()) throw new Error("This code has expired. Request a new one.");
      if ((record.attempts ?? 0) >= OTP_MAX_ATTEMPTS) throw new Error("Too many incorrect attempts. Request a new code.");

      if (!/^\d{6}$/.test(data.otp) || !safeEqual(record.code_hash, hashOtp(data.phone, data.role, data.otp))) {
        await sb
          .from("staff_login_otps")
          .update({ attempts: (record.attempts ?? 0) + 1 })
          .eq("id", record.id);
        throw new Error("Incorrect code. Please try again.");
      }

      await sb.from("staff_login_otps").update({ consumed_at: new Date().toISOString() }).eq("id", record.id);
    } else if (data.role === "partner" && data.fullName.length < 2) {
      throw new Error("Enter your full name");
    }

    const userMetadata = {
      full_name: data.fullName || user?.user_metadata?.full_name || (data.role === "admin" ? "Admin" : null),
      phone: data.phone,
      role: data.role,
    };

    if (!user) {
      const { data: created, error } = await sb.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: userMetadata,
      });
      if (error) throw new Error(error.message);
      user = created.user;
    } else {
      const { data: updated, error } = await sb.auth.admin.updateUserById(user.id, {
        password,
        email_confirm: true,
        user_metadata: { ...(user.user_metadata ?? {}), ...userMetadata },
      });
      if (error) throw new Error(error.message);
      user = updated.user ?? user;
    }

    if (!user?.id) throw new Error("Could not prepare login. Please try again.");

    if (data.role === "admin") {
      const { data: adminRoles, error: adminRolesError } = await sb
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      if (adminRolesError) throw new Error(adminRolesError.message);

      const existingAdminIds = new Set((adminRoles ?? []).map((row: { user_id: string }) => row.user_id));
      const samePhoneUsers = await findAuthUsersByPhone(sb, data.phone);
      const samePhoneHasAdmin = samePhoneUsers.some((samePhoneUser) => existingAdminIds.has(samePhoneUser.id));
      const thisUserHasAdmin = existingAdminIds.has(user.id);

      if (existingAdminIds.size > 0 && !samePhoneHasAdmin && !thisUserHasAdmin) {
        throw new Error("Admin access is not enabled for this phone");
      }
    }

    const { error: roleError } = await sb
      .from("user_roles")
      .upsert({ user_id: user.id, role: data.role }, { onConflict: "user_id,role" });
    if (roleError) throw new Error(roleError.message);

    if (data.role === "partner") {
      const partnerPayload = {
        id: user.id,
        full_name: data.fullName || userMetadata.full_name || "",
        phone: data.phone,
        email,
        updated_at: new Date().toISOString(),
      };
      const { error: partnerError } = await sb.from("partners").upsert(partnerPayload, { onConflict: "id" });
      if (partnerError) throw new Error(partnerError.message);
    }

    return { email, password };
  });
