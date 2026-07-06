// Live end-to-end test of the vendor ZK enrolment gate, through the backend API.
//
// Stages a NON-demo business that is in the government business registry with a valid licence
// ("Green Field Agro Centre", AGRI_INPUT) and admin-approves it on-chain, but does NOT ZK-enrol it.
// Then proves: an approved + category-allowed but UN-enrolled vendor is blocked at payment; after the
// admin ZK-enrols it (real proof), the same payment succeeds. Also checks the RBAC + category guards.
//
// Run: node scripts/vendor-zk-gate.mjs   (needs the stack up + seeded; cron off)
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { Wallet, JsonRpcProvider, Contract, getAddress, dataSlice, id as keccakId } from "ethers";

const require = createRequire(import.meta.url);
const API = "http://localhost:3001/api";

const env = readFileSync(".env", "utf8");
const RELAYER_KEY = env.match(/RELAYER_PRIVATE_KEY=(\S+)/)[1];
const RPC = (env.match(/CHAIN_RPC_URL=(\S+)/) || [])[1] || "http://127.0.0.1:8545";
const deployment = require("../packages/contracts/deployments/localhost.json");
const provider = new JsonRpcProvider(RPC);
const relayer = new Wallet(RELAYER_KEY, provider);
const vendorReg = new Contract(deployment.addresses.VendorRegistry, deployment.abis.VendorRegistry, relayer);

let pass = 0, fail = 0;
const chk = (n, c) => { console.log(`  ${c ? "[PASS]" : "[FAIL]"} ${n}`); c ? pass++ : fail++; };
const vendorAddress = (name) => getAddress(dataSlice(keccakId(`vendor:${name}`), 12));

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json;
  const text = await res.text();
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

const NAME = "Green Field Agro Centre";
const ADDR = vendorAddress(NAME);

async function main() {
  console.log(`\n=== Live vendor ZK gate: ${NAME} (${ADDR.slice(0, 10)}…) ===`);

  // 1) approve on-chain (out-of-band relayer tx; backend was restarted so its nonce cache is clear)
  //    + mirror into the vendors cache the backend reads.
  if (!(await vendorReg.isApproved(ADDR))) {
    await (await vendorReg.approveVendor(ADDR, 0)).wait(); // 0 = AGRI_INPUT
  }
  execSync(
    `docker exec bharatchain-postgres-1 psql -U bharat -d bharatchain -c ` +
      `"INSERT INTO vendors (address, name, category, city, approved, \\"syncedAt\\") ` +
      `VALUES ('${ADDR}', '${NAME}', 'AGRI_INPUT', 'Ludhiana', true, now()) ` +
      `ON CONFLICT (address) DO UPDATE SET approved=true;"`,
    { stdio: "pipe" },
  );
  chk("vendor approved on-chain + mirrored to cache", await vendorReg.isApproved(ADDR));

  // 2) a funded citizen on scheme 0
  const farmers = require("../packages/registry/data/registry.json").filter((r) => r.profession === 1);
  const pan = farmers[Math.floor(Math.random() * farmers.length)].pan;
  const phone = "9" + Math.floor(100000000 + Math.random() * 899999999);
  const su = await api("/auth/signup", { method: "POST", body: { phone, password: "citizen123", fullName: "Gate " + pan } });
  const vr = await api("/auth/verify-otp", { method: "POST", body: { phone, code: su.json.devCode } });
  const token = vr.json.tokens.accessToken;
  const app = await api("/applications", { method: "POST", token, body: { schemeId: 0, pan } });
  const sub = await api(`/applications/${app.json.id}/submit`, { method: "POST", token });
  chk("citizen enrolled scheme 0", sub.json.status === "APPROVED");
  const admin = (await api("/auth/login", { method: "POST", body: { phone: "9000000000", password: "admin12345" } })).json.tokens.accessToken;
  const round = await api("/disbursement/rounds", { method: "POST", token: admin, body: { schemeId: 0 } });
  chk("disbursed (entitlement funded)", round.json.failed === 0 && round.json.claimed >= 1);

  // 3) THE GATE — pay an approved + category-allowed but NOT-yet-ZK-enrolled vendor -> blocked
  const pay1 = await api("/payments", { method: "POST", token, body: { schemeId: 0, vendorAddress: ADDR, amount: "1000" } });
  chk("pay UNENROLLED vendor blocked (400 'not ZK-enrolled')", pay1.status === 400 && /not ZK-enrolled/i.test(JSON.stringify(pay1.json)));

  // 4) RBAC — a citizen cannot ZK-enrol a vendor
  const cz = await api(`/vendors/${ADDR}/enroll`, { method: "POST", token, body: { schemeId: 0 } });
  chk("citizen cannot ZK-enrol a vendor (403)", cz.status === 403);

  // 5) category guard — enrolling an AGRI vendor into scheme 1 (EDU/TECH) is rejected
  const wrong = await api(`/vendors/${ADDR}/enroll`, { method: "POST", token: admin, body: { schemeId: 1 } });
  chk("enrol into category-mismatched scheme blocked (400)", wrong.status === 400);

  // 6) admin ZK-enrols the vendor into scheme 0 (real Groth16 proof)
  const enr = await api(`/vendors/${ADDR}/enroll`, { method: "POST", token: admin, body: { schemeId: 0 } });
  chk("admin ZK-enrolled vendor into scheme 0", enr.json.enrolled === true);

  // 7) the SAME payment now succeeds
  const pay2 = await api("/payments", { method: "POST", token, body: { schemeId: 0, vendorAddress: ADDR, amount: "1000" } });
  chk("pay now succeeds after enrolment (PAID)", pay2.json.status === "PAID");

  // 8) idempotency — re-enrol returns alreadyEnrolled, no new tx
  const again = await api(`/vendors/${ADDR}/enroll`, { method: "POST", token: admin, body: { schemeId: 0 } });
  chk("re-enrol is idempotent (alreadyEnrolled)", again.json.alreadyEnrolled === true);

  console.log(`\n==========================================`);
  console.log(`  VENDOR ZK GATE: ${pass} passed, ${fail} failed`);
  console.log(`==========================================`);
  provider.destroy();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
