---
name: Security Audit Findings Fix
description: Infrastructure and RLS fixes identified during forensic audit
type: constraint
---
# Security Memory

## Findings Fixed (2026-08-12)

### Auth & Roles
- **Vulnerability**: Potential for privilege escalation if roles are not strictly managed.
- **Fix**: Implemented `user_roles` table with `SECURITY DEFINER` helper function `has_role`.
- **Status**: Fixed.

### Payment Logs
- **Vulnerability**: `payment_attempts` table lacked restrictive RLS, potentially leaking transaction metadata.
- **Fix**: Enabled RLS and scoped SELECT to `auth.uid() = user_id` or `admin` role.
- **Status**: Fixed.

### OTP Storage
- **Vulnerability**: `staff_login_otps` visible to authenticated users via Data API.
- **Fix**: Restricted all access to `service_role` only.
- **Status**: Fixed.
