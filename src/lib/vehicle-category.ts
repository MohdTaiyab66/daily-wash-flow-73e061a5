// Maps a vehicle model name to a finer-grained body-type label.
// Falls back to the broad DB category when no keyword matches.
//
// IMPORTANT: this file only controls the *label* shown next to a car.
// The pricing tier lives in `vehicle_catalog.category` / `customer_vehicles.category`
// ('hatchback_compact_sedan' vs 'sedan_suv'). Sub-4m compact SUVs
// (Venue, Exter, Fronx, Brezza, XUV300, XUV 3XO, Punch, Nexon, Sonet,
// Syros, Kiger, Magnite, Kushaq, Taigun, C3 Aircross, Basalt) share the
// small-car pricing tier — keep both in sync when adding new models.

// True mid/large SUVs — priced in the SUV tier.
const SUV = [
  "fortuner", "creta", "seltos", "harrier", "safari", "scorpio",
  "xuv700", "xuv 700", "xuv500", "xuv 500", "hyryder", "grand vitara", "vitara",
  "hycross", "innova", "carnival", "carens", "ertiga", "xl6", "triber",
  "thar", "gloster", "hector", "astor", "duster", "compass", "meridian",
  "endeavour", "tucson", "alcazar", "mahindra bolero", "bolero",
  "kicks", "elevate",
];

// Sub-4m compact SUVs / crossovers — small-car pricing tier.
const COMPACT_SUV = [
  "venue", "exter", "fronx", "brezza", "xuv300", "xuv 300", "xuv 3xo", "xuv3xo", "3xo",
  "punch", "nexon", "sonet", "syros", "kiger", "magnite",
  "kushaq", "taigun", "c3 aircross", "basalt",
];

const HATCH = [
  "swift", "baleno", "altroz", "i20", "i10", "polo", "tiago", "glanza",
  "wagonr", "wagon r", "alto", "celerio", "kwid", "ignis", "s-presso", "spresso",
  "santro", "redi-go", "redigo", "micra", "punto", "figo", "citroen c3",
];

const COMPACT_SEDAN = [
  "dzire", "amaze", "aura", "tigor", "xcent", "ameo", "zest", "etios",
];

const SEDAN = [
  "city", "verna", "ciaz", "slavia", "virtus", "octavia", "camry", "civic",
  "rapid", "vento", "linea", "manza", "sunny", "cruze",
];

function norm(s: string) {
  return s.toLowerCase().trim();
}

export function vehicleBodyLabel(make: string, model: string, fallbackCategory?: string | null): string {
  const m = norm(model);
  const full = norm(`${make} ${model}`);
  const has = (list: string[]) => list.some((k) => m === k || m.includes(k) || full.includes(k));
  // Check compact SUVs BEFORE the SUV list so entries like "punch" / "nexon"
  // aren't accidentally caught by broader SUV keywords.
  if (has(COMPACT_SUV)) return "Compact SUV";
  if (has(SUV)) return "SUV";
  if (has(COMPACT_SEDAN)) return "Compact Sedan";
  if (has(SEDAN)) return "Sedan";
  if (has(HATCH)) return "Hatchback";
  if (fallbackCategory === "sedan_suv") return "Sedan / SUV";
  if (fallbackCategory === "hatchback_compact_sedan") return "Hatchback / Compact";
  return "Vehicle";
}
