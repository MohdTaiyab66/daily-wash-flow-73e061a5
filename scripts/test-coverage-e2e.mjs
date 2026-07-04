// End-to-end coverage polygon smoke test.
//
// Verifies:
//   1. admin_zone_upsert round-trip: create polygon -> reload -> identity check
//   2. Boundary rule: on-vertex, on-edge points are INSIDE (serviceable)
//   3. Deny path: outside points, coming_soon zones
//   4. Priority: higher-priority overlay wins in overlap region
//   5. Mock customer addresses at each anchor point are stored + serviceable
//
// Run:  node scripts/test-coverage-e2e.mjs
// Exits non-zero on any failure.

import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required"); process.exit(2); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"}  ${name}${detail ? "  — " + detail : ""}`);
};

// A well-defined test polygon (square, boundary-testable).
const TEST_NAME = `TEST: E2E Polygon ${Date.now()}`;
const testPoly = [
  [80.850, 26.900],
  [80.870, 26.900],
  [80.870, 26.910],
  [80.850, 26.910],
];
const INSIDE      = { lat: 26.905, lng: 80.860 };
const OUTSIDE     = { lat: 26.700, lng: 80.500 };
const ON_VERTEX   = { lat: 26.900, lng: 80.850 };
const ON_EDGE     = { lat: 26.900, lng: 80.860 };

// Overlap sanity (relies on the seeded Sample zones).
const OVERLAP_POINT = { lat: 26.850, lng: 80.990 };   // Gomti + Overlay
const GOMTI_ONLY    = { lat: 26.850, lng: 80.981 };
const COMING_SOON   = { lat: 26.800, lng: 80.910 };   // Alambagh
const RADIUS_INSIDE = { lat: 26.867, lng: 81.030 };   // Chinhat center

async function coverageAt(p) {
  const { data, error } = await sb.rpc("get_coverage_at", { p_lat: p.lat, p_lng: p.lng });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}
async function serviceable(p, slug = "premium") {
  const { error } = await sb.rpc("assert_serviceable", { p_lat: p.lat, p_lng: p.lng, p_slug: slug });
  return error ? error.message : null;
}

async function main() {
  // ---- 1. Round-trip: create -> reload -> identity ----
  const { data: newId, error: upErr } = await sb.rpc("admin_zone_upsert", {
    payload: {
      name: TEST_NAME, city: "Lucknow", color: "#000000", priority: 50,
      zone_type: "polygon", status: "active", polygon: testPoly,
      premium_enabled: true, daily_shine_enabled: true,
    },
  });
  check("upsert: new polygon returns id", !upErr && !!newId, upErr?.message);
  if (!newId) throw new Error("cannot continue without zone id");

  const { data: reloaded, error: rErr } = await sb
    .from("coverage_zones").select("*").eq("id", newId).single();
  check("reload: row exists", !rErr && !!reloaded, rErr?.message);
  check(
    "reload: polygon identity preserved",
    JSON.stringify(reloaded.polygon) === JSON.stringify(testPoly),
    `stored=${JSON.stringify(reloaded.polygon)}`,
  );
  check(
    "reload: bbox auto-computed",
    reloaded.bbox_min_lat === 26.9 && reloaded.bbox_max_lat === 26.91 &&
    reloaded.bbox_min_lng === 80.85 && reloaded.bbox_max_lng === 80.87,
    `bbox=[${reloaded.bbox_min_lat},${reloaded.bbox_min_lng}..${reloaded.bbox_max_lat},${reloaded.bbox_max_lng}]`,
  );

  // ---- 2. Serviceability at each anchor point ----
  const insideCov = await coverageAt(INSIDE);
  check("gating: inside point matches new zone", insideCov?.zone_id === newId, insideCov?.zone_name);

  const outsideCov = await coverageAt(OUTSIDE);
  check("gating: outside point not matched", !outsideCov?.matched, String(outsideCov?.zone_name));

  const vertexCov = await coverageAt(ON_VERTEX);
  check(
    "boundary: on-vertex point is INSIDE (boundary-inclusive rule)",
    vertexCov?.matched === true, String(vertexCov?.zone_name),
  );

  const edgeCov = await coverageAt(ON_EDGE);
  check(
    "boundary: on-edge midpoint is INSIDE (boundary-inclusive rule)",
    edgeCov?.matched === true, String(edgeCov?.zone_name),
  );

  // ---- 3. Priority / overlap ----
  const overlap = await coverageAt(OVERLAP_POINT);
  check(
    "priority: overlay (priority 20) wins over Gomti (priority 10)",
    overlap?.zone_name === "Sample: Gomti Premium Overlay",
    overlap?.zone_name,
  );
  const gomti = await coverageAt(GOMTI_ONLY);
  check(
    "priority: point outside overlay falls back to Gomti Square",
    gomti?.zone_name === "Sample: Gomti Square",
    gomti?.zone_name,
  );

  // ---- 4. Deny paths via assert_serviceable ----
  check(
    "assert_serviceable: OUTSIDE point is rejected",
    (await serviceable(OUTSIDE)) !== null,
  );
  check(
    "assert_serviceable: coming_soon zone is rejected (not returned by get_coverage_at)",
    (await serviceable(COMING_SOON)) !== null,
  );
  check(
    "assert_serviceable: INSIDE + premium enabled -> allowed",
    (await serviceable(INSIDE, "premium")) === null,
  );
  check(
    "assert_serviceable: vertex boundary point -> allowed",
    (await serviceable(ON_VERTEX, "premium")) === null,
  );
  check(
    "assert_serviceable: radius zone allows service",
    (await serviceable(RADIUS_INSIDE, "premium")) === null,
  );

  // ---- 5. Mock customer addresses (inside / outside / vertex / edge) ----
  // Use a synthetic user_id so this test needs no auth signup. Rows are
  // tagged and cleaned up at the end so RLS-only production data is safe.
  const MOCK_USER = "00000000-0000-0000-0000-00000000c0de";
  await sb.from("customer_addresses").delete().eq("user_id", MOCK_USER);
  const points = [
    { label: "MOCK-inside",  ...INSIDE,    expect: true  },
    { label: "MOCK-vertex",  ...ON_VERTEX, expect: true  },
    { label: "MOCK-edge",    ...ON_EDGE,   expect: true  },
    { label: "MOCK-outside", ...OUTSIDE,   expect: false },
  ];
  for (const p of points) {
    const { error: insErr } = await sb.from("customer_addresses").insert({
      user_id: MOCK_USER, label: p.label,
      address_line: `${p.label} @ ${p.lat.toFixed(4)},${p.lng.toFixed(4)}`,
      area: "Mock", latitude: p.lat, longitude: p.lng,
    });
    if (insErr) { check(`mock: insert ${p.label}`, false, insErr.message); continue; }
    const cov = await coverageAt({ lat: p.lat, lng: p.lng });
    const got = !!cov?.matched;
    check(
      `mock: ${p.label} at ${p.lat},${p.lng} coverage=${got} (expected ${p.expect})`,
      got === p.expect,
    );
  }

  // ---- Cleanup ----
  await sb.from("customer_addresses").delete().eq("user_id", MOCK_USER);
  await sb.rpc("admin_zone_delete", { p_id: newId });

  const failed = results.filter((r) => !r.ok);
  console.log("\n" + "─".repeat(60));
  if (failed.length === 0) {
    console.log(`ALL ${results.length} COVERAGE E2E CHECKS PASSED`);
    process.exit(0);
  } else {
    console.log(`${failed.length} / ${results.length} FAILED`);
    process.exit(1);
  }
}

main().catch((err) => { console.error("FATAL:", err.message ?? err); process.exit(1); });
