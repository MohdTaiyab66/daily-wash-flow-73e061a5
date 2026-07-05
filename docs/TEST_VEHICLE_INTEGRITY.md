# Vehicle Integrity Test

End-to-end multi-car test that verifies:

1. Bookings and add-on requests only accept a vehicle that belongs to the
   customer (`trg_bookings_enforce_vehicle_owner`,
   `trg_addon_enforce_vehicle_owner`).
2. Scheduled services only accept an ops-vehicle that belongs to the
   service's customer (`trg_services_enforce_vehicle_owner`).
3. The admin `/admin/vehicle-audit` screen surfaces mismatches.
4. Vehicle-trace log records the scheduling and admin-render events.

## Run

```bash
SUPABASE_URL=...           \
SUPABASE_SERVICE_ROLE_KEY=... \
TEST_CUSTOMER_EMAIL=vehtest+customer@example.com \
TEST_CUSTOMER_PASSWORD=... \
TEST_ADMIN_EMAIL=you@admin.urbanwash.app \
TEST_ADMIN_PASSWORD=...   \
BASE_URL=http://localhost:8080 \
node scripts/test-vehicle-integrity.mjs
```

Screenshots land in `/tmp/browser/vehicle-integrity/`.

The negative test (trigger rejects cross-customer `vehicle_id`) runs against
whatever services + vehicles already exist. Exits non-zero on any failure.
