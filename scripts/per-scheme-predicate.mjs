// Live test of per-scheme eligibility predicates (task A), through the backend API.
//
// Demonstrates that eligibility now DIFFERS by scheme sector:
//   scheme 0 AGRICULTURE : farmer rule
//   scheme 1 EDUCATION   : Post-Matric — enrolled student + reserved caste + income under
//                          the caste-specific cap (SC/ST 250k, OBC 150k, EBC 100k, Minority 200k)
//   scheme 2 HOUSING     : PMAY-G — kutcha/houseless + income <= 180k + not excluded
// using three citizens that fall differently across the matrix.
//
// Run: node scripts/per-scheme-predicate.mjs   (stack up + seeded)
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const API = "http://localhost:3001/api";
const registry = require("../packages/registry/data/registry.json");

let pass = 0, fail = 0;
const chk = (n, c) => { console.log(`  ${c ? "[PASS]" : "[FAIL]"} ${n}`); c ? pass++ : fail++; };

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json; const text = await res.text();
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

const pick = (pred) => { const xs = registry.filter(pred); return xs[Math.floor(Math.random() * xs.length)]; };

async function newCitizen(pan) {
  const phone = "9" + Math.floor(100000000 + Math.random() * 899999999);
  const su = await api("/auth/signup", { method: "POST", body: { phone, password: "citizen123", fullName: "P " + pan } });
  const vr = await api("/auth/verify-otp", { method: "POST", body: { phone, code: su.json.devCode } });
  return vr.json.tokens.accessToken;
}

async function enroll(token, schemeId, pan) {
  const app = await api("/applications", { method: "POST", token, body: { schemeId, pan } });
  if (!app.json?.id) return `create-failed(${app.status})`;
  const sub = await api(`/applications/${app.json.id}/submit`, { method: "POST", token });
  return sub.json.status;
}

// Real per-scheme predicates (must mirror eligibility.circom).
const EDU_CAPS = { 1: 250000, 2: 250000, 3: 150000, 4: 100000, 5: 200000 }; // by caste code; General (0) has none
const eduOk = (r) => r.isStudent === 1 && EDU_CAPS[r.caste] !== undefined && r.income <= EDU_CAPS[r.caste];
const housingOk = (r) => (r.houseStatus === 1 || r.houseStatus === 2) && r.housingExcluded === 0 && r.income <= 180000;

async function main() {
  const A = pick((r) => r.profession === 1 && eduOk(r) && housingOk(r)); // farmer, also edu+housing eligible
  const B = pick((r) => r.profession === 1 && !eduOk(r) && !housingOk(r)); // farmer only
  const C = pick((r) => r.profession === 2 && eduOk(r) && housingOk(r)); // non-farmer, edu+housing eligible

  console.log(`\n=== Per-scheme predicates: AGRI(farmer) / EDU(student+caste-cap) / HOUSING(PMAY-G) ===`);
  console.log(`  A farmer, edu+housing OK   ${A.pan}  income ₹${A.income} caste=${A.casteLabel} student=${A.isStudent} house=${A.houseStatusLabel}`);
  console.log(`  B farmer only              ${B.pan}  income ₹${B.income} caste=${B.casteLabel} student=${B.isStudent} house=${B.houseStatusLabel}`);
  console.log(`  C non-farmer, edu+housing  ${C.pan}  income ₹${C.income} caste=${C.casteLabel} student=${C.isStudent} house=${C.houseStatusLabel}`);

  console.log(`\n--- A: qualifies for ALL three ---`);
  const ta = await newCitizen(A.pan);
  chk("A → agriculture APPROVED (farmer)", (await enroll(ta, 0, A.pan)) === "APPROVED");
  chk("A → education APPROVED (student + caste cap)", (await enroll(ta, 1, A.pan)) === "APPROVED");
  chk("A → housing APPROVED (PMAY-G)", (await enroll(ta, 2, A.pan)) === "APPROVED");

  console.log(`\n--- B: agri only, education + housing predicates reject ---`);
  const tb = await newCitizen(B.pan);
  chk("B → agriculture APPROVED (farmer)", (await enroll(tb, 0, B.pan)) === "APPROVED");
  chk("B → education REJECTED (fails student/caste/income)", (await enroll(tb, 1, B.pan)) === "REJECTED");
  chk("B → housing REJECTED (fails PMAY-G rule)", (await enroll(tb, 2, B.pan)) === "REJECTED");

  console.log(`\n--- C: scholarship + housing, but NOT the farmer scheme ---`);
  const tc = await newCitizen(C.pan);
  chk("C → agriculture REJECTED (not a farmer)", (await enroll(tc, 0, C.pan)) === "REJECTED");
  chk("C → education APPROVED (student + caste cap)", (await enroll(tc, 1, C.pan)) === "APPROVED");
  chk("C → housing APPROVED (PMAY-G)", (await enroll(tc, 2, C.pan)) === "APPROVED");

  console.log(`\n==========================================`);
  console.log(`  PER-SCHEME PREDICATE: ${pass} passed, ${fail} failed`);
  console.log(`==========================================`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
