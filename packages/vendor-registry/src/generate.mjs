// Deterministic generator for the government BUSINESS (GST) reference registry.
//
// IMPORTANT: generated ONCE with a FIXED seed and committed as data/vendors.json. It is the
// "official business registry" vendor eligibility is proven against (symmetric to the citizen
// government registry). It must NEVER be randomized at runtime. Real businesses are appended on
// request — this is a REFERENCE registry, NOT the approved-vendor list (vendors still self-register
// and an admin approves them; ZK enrolment proves they exist in this registry with a valid licence).
//
// category (matches VendorCategory uint8 order in packages/shared):
//   0 = AGRI_INPUT, 1 = EDU_INSTITUTION, 2 = TECH_STORE, 3 = HOUSING_MATERIAL
// licenseValid: 1 = valid/active trade licence (eligible), 0 = lapsed/none (cannot prove eligibility).

export const CATEGORY_LABEL = ["AGRI_INPUT", "EDU_INSTITUTION", "TECH_STORE", "HOUSING_MATERIAL"];

// The 8 seeded demo institutions — names MUST match apps/backend/src/seed/seed.data.ts SEED_VENDORS.
// All hold valid licences so they can ZK-enrol into the schemes that allow their category.
const DEMO = [
  { name: "Krishi Seva Kendra", category: 0, city: "Bhopal" },
  { name: "Annapurna Agri Inputs", category: 0, city: "Nagpur" },
  { name: "Bharat Institute of Technology", category: 1, city: "Indore" },
  { name: "Saraswati National University", category: 1, city: "Bhopal" },
  { name: "DigiBharat Tech Store", category: 2, city: "Jaipur" },
  { name: "Sharma Electronics & Computers", category: 2, city: "Nagpur" },
  { name: "Shakti Cement & Building Materials", category: 3, city: "Raipur" },
  { name: "Ambika Steel & Hardware Suppliers", category: 3, city: "Kanpur" },
];

// Extra fictional businesses per category. The LAST entry of each category has a LAPSED licence
// (licenseValid: 0) so the registry contains at least one ineligible business per category to demo
// ZK rejection.
const EXTRA = [
  { name: "Green Field Agro Centre", category: 0, city: "Ludhiana" },
  { name: "Kisan Mandi Supplies", category: 0, city: "Hisar" },
  { name: "Sunrise Seeds & Fertilisers", category: 0, city: "Guntur", lapsed: true },
  { name: "National College of Engineering", category: 1, city: "Pune" },
  { name: "Gyan Jyoti Vidyalaya", category: 1, city: "Lucknow" },
  { name: "Heritage Public School", category: 1, city: "Patna", lapsed: true },
  { name: "TechnoMart Computer Bazaar", category: 2, city: "Hyderabad" },
  { name: "Bharti Mobile & Gadgets", category: 2, city: "Surat" },
  { name: "ClickBuy Electronics Hub", category: 2, city: "Kolkata", lapsed: true },
  { name: "Maa Durga Cement Depot", category: 3, city: "Ranchi" },
  { name: "Vishwakarma Hardware Mart", category: 3, city: "Jaipur" },
  { name: "Sai Construction Stores", category: 3, city: "Nagpur", lapsed: true },
];

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const STATE_CODES = ["23", "27", "09", "08", "03", "29", "24", "33", "36", "10"];

// Small, fast, deterministic PRNG (mulberry32) — same family as the citizen generator.
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

/** A deterministic 15-char GSTIN-like business id: 2 state + 10 PAN-ish + entity + 'Z' + check. */
function makeGstin(rnd) {
  let s = STATE_CODES[Math.floor(rnd() * STATE_CODES.length)];
  for (let i = 0; i < 5; i++) s += LETTERS[Math.floor(rnd() * 26)];
  for (let i = 0; i < 4; i++) s += Math.floor(rnd() * 10);
  s += LETTERS[Math.floor(rnd() * 26)];
  s += String(1 + Math.floor(rnd() * 9));
  s += "Z";
  s += LETTERS[Math.floor(rnd() * 26)];
  return s;
}

/**
 * Generate the fixed business registry (demo institutions first, then extras). Deterministic given
 * the seed; GSTINs are assigned in fixture order so the committed Merkle root is stable.
 */
export function generateVendorRegistry(seed = 20260623) {
  const rnd = mulberry32(seed);
  const records = [];
  const all = [
    ...DEMO.map((d) => ({ ...d, lapsed: false })),
    ...EXTRA.map((e) => ({ lapsed: false, ...e })),
  ];
  for (const b of all) {
    records.push({
      businessId: makeGstin(rnd),
      name: b.name,
      category: b.category,
      categoryLabel: CATEGORY_LABEL[b.category],
      licenseValid: b.lapsed ? 0 : 1,
      city: b.city,
    });
  }
  return records;
}
