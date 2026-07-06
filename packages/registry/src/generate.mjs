// Deterministic generator for the government citizen reference registry.
//
// IMPORTANT: this is generated ONCE with a FIXED seed and committed as data/registry.json. It is the
// "official government data" eligibility is checked against. It must NEVER be randomized at runtime
// (random data caused major bugs in the earlier version). Real citizens are appended on request.
//
// Profession codes (match the eligibility circuit): 0 = unknown/unregistered, 1 = farmer, 2 = non-farmer.
// Caste codes (education scholarship): 0 = General, 1 = SC, 2 = ST, 3 = OBC, 4 = EBC, 5 = Minority.
// House-status codes (PMAY-Gramin housing): 0 = adequate/pucca, 1 = kutcha, 2 = houseless.
//
// NOTE ON DETERMINISM: the isStudent/caste/house attributes are drawn AT THE END of each record so
// the pre-existing fields (name, pan, profession, income, …) consume the exact same PRNG sequence as
// before — their values are byte-identical to the prior fixture. Only the committed Merkle ROOT
// changes (the leaf now hashes the new attributes). Not everyone qualifies: a citizen is
// education-eligible only if they are a non-General student under their category income cap, and
// housing-eligible only if houseless/kutcha, under the income line, and not otherwise excluded.

const CASTE_LABELS = ["General", "SC", "ST", "OBC", "EBC", "Minority"];
const HOUSE_LABELS = ["Adequate (pucca)", "Kutcha", "Houseless"];

const FIRST = [
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Krishna", "Ishaan", "Rohan",
  "Kabir", "Ananya", "Diya", "Aadhya", "Saanvi", "Pari", "Anika", "Navya", "Myra", "Sara",
  "Ramesh", "Suresh", "Mahesh", "Lakshmi", "Sunita", "Geeta", "Pooja", "Manoj", "Rajesh", "Vijay",
];
const LAST = [
  "Sharma", "Verma", "Patel", "Reddy", "Naidu", "Kumar", "Singh", "Yadav", "Das", "Gowda",
  "Iyer", "Nair", "Mishra", "Pandey", "Chauhan", "Mehta", "Joshi", "Rao", "Bhat", "Kaur",
];
const NON_FARM = [
  "Teacher", "Shopkeeper", "Driver", "Tailor", "Electrician", "Clerk", "Mechanic", "Weaver", "Carpenter", "Nurse",
];
const STATES = [
  "Madhya Pradesh", "Maharashtra", "Uttar Pradesh", "Bihar", "Rajasthan",
  "Punjab", "Karnataka", "Gujarat", "Tamil Nadu", "Telangana",
];
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Small, fast, deterministic PRNG (mulberry32).
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makePan(rnd) {
  let s = "";
  for (let i = 0; i < 5; i++) s += LETTERS[Math.floor(rnd() * 26)];
  for (let i = 0; i < 4; i++) s += Math.floor(rnd() * 10);
  s += LETTERS[Math.floor(rnd() * 26)];
  return s;
}

/**
 * Generate `count` deterministic registry records.
 * Composition (demoable across all eligibility paths):
 *   ~40% farmers (eligible), ~35% non-farmers (rejected),
 *   ~25% unknown profession — ~60% of those have Kissan card + land record (eligible via fallback).
 */
export function generateRegistry(count = 10000, seed = 20260621) {
  const rnd = mulberry32(seed);
  const records = [];
  for (let i = 0; i < count; i++) {
    const name = `${FIRST[Math.floor(rnd() * FIRST.length)]} ${LAST[Math.floor(rnd() * LAST.length)]}`;
    const pan = makePan(rnd);
    const roll = rnd();

    let profession;
    let professionLabel;
    let kissan = "";
    let land = "";

    if (roll < 0.4) {
      profession = 1;
      professionLabel = "Farmer";
      kissan = `KCC${100000 + i}`;
      land = `LR${200000 + i}`;
    } else if (roll < 0.75) {
      profession = 2;
      professionLabel = NON_FARM[Math.floor(rnd() * NON_FARM.length)];
    } else {
      profession = 0;
      professionLabel = "Unregistered";
      if (rnd() < 0.6) {
        kissan = `KCC${100000 + i}`;
        land = `LR${200000 + i}`;
      }
    }

    const income = 50000 + Math.floor(rnd() * 450000);
    const phone = `9${String(Math.floor(rnd() * 1_000_000_000)).padStart(9, "0")}`;
    const email = rnd() < 0.3 ? `${name.toLowerCase().replace(/[^a-z]/g, "")}${i}@example.in` : "";
    const state = STATES[Math.floor(rnd() * STATES.length)];

    records.push({ pan, kissan, land, profession, professionLabel, income, name, phone, email, state });
  }

  // --- SECOND PASS: education + housing attributes from an INDEPENDENT PRNG stream.
  //     The base stream above is untouched, so every pre-existing field stays
  //     byte-identical to the original committed fixture (fixed-registry rule);
  //     only the Merkle root changes because the leaf now hashes these fields. ---
  const rnd2 = mulberry32(seed ^ 0x5f3759df);
  for (const r of records) {
    // Social category (education scholarship). Distribution roughly mirrors India's.
    const cRoll = rnd2();
    let caste;
    if (cRoll < 0.25) caste = 0; // General
    else if (cRoll < 0.43) caste = 1; // SC
    else if (cRoll < 0.53) caste = 2; // ST
    else if (cRoll < 0.83) caste = 3; // OBC
    else if (cRoll < 0.9) caste = 4; // EBC
    else caste = 5; // Minority

    // ~28% of citizens are currently enrolled students.
    const isStudent = rnd2() < 0.28 ? 1 : 0;

    // Housing condition (PMAY-Gramin). Most have an adequate house; some don't.
    const hRoll = rnd2();
    const houseStatus = hRoll < 0.55 ? 0 : hRoll < 0.85 ? 1 : 2;

    // Non-income PMAY-G exclusions (income-tax payer / >2.5-acre irrigated land /
    // govt employee / motorised vehicle), captured as one precomputed flag.
    const housingExcluded = rnd2() < 0.18 ? 1 : 0;

    Object.assign(r, {
      caste, casteLabel: CASTE_LABELS[caste],
      isStudent,
      houseStatus, houseStatusLabel: HOUSE_LABELS[houseStatus],
      housingExcluded,
    });
  }
  return records;
}
