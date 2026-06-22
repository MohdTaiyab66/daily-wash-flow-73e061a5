// Maps a vehicle model name to a finer-grained body-type label.
// Falls back to the broad DB category when no keyword matches.

const SUV = [
  "fortuner", "creta", "seltos", "nexon", "venue", "brezza", "vitara", "grand vitara",
  "harrier", "safari", "scorpio", "xuv", "kushaq", "taigun", "hyryder", "carnival",
  "innova", "hycross", "triber", "magnite", "kicks", "ertiga", "xl6", "punch",
  "thar", "gloster", "hector", "astor", "kiger", "duster", "compass", "meridian",
  "endeavour", "tucson", "alcazar", "tigor ev", "mahindra bolero", "bolero",
  "carens", "kushaq", "elevate", "exter",
];

const HATCH = [
  "swift", "baleno", "altroz", "i20", "i10", "polo", "tiago", "glanza",
  "wagonr", "wagon r", "alto", "celerio", "kwid", "ignis", "s-presso", "spresso",
  "santro", "redi-go", "redigo", "micra", "punto", "figo",
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
  if (has(SUV)) return "SUV";
  if (has(COMPACT_SEDAN)) return "Compact Sedan";
  if (has(SEDAN)) return "Sedan";
  if (has(HATCH)) return "Hatchback";
  if (fallbackCategory === "sedan_suv") return "Sedan / SUV";
  if (fallbackCategory === "hatchback_compact_sedan") return "Hatchback / Compact";
  return "Vehicle";
}
