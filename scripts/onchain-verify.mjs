// Authoritative on-chain verification: drive a fresh lifecycle through the backend,
// then read the blockchain DIRECTLY (ethers) to confirm every transaction succeeded
// (receipt.status === 1) and the on-chain state matches. No trust in the API's word.
//   node scripts/onchain-verify.mjs
import { JsonRpcProvider, Contract, formatEther, parseEther } from "ethers";
import { readFileSync } from "node:fs";

const API = "http://localhost:3001/api";
const RPC = "http://127.0.0.1:8545";
const dep = JSON.parse(readFileSync("packages/contracts/deployments/localhost.json", "utf8"));
const registry = JSON.parse(readFileSync("packages/registry/data/registry.json", "utf8"));
const provider = new JsonRpcProvider(RPC);
const C = (n) => new Contract(dep.addresses[n], dep.abis[n], provider);
const schemes = C("SchemeRegistry"), disb = C("DisbursementController"), router = C("PaymentRouter"),
      redemption = C("RedemptionController"), token = C("DigitalRupee");

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`  ${c ? "[PASS]" : "[FAIL]"} ${n}`); c ? pass++ : fail++; };
const post = async (p, b, t) => {
  const r = await fetch(API + p, { method: "POST", headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify(b ?? {}) });
  if (!r.ok) throw new Error(`${p} -> ${r.status} ${JSON.stringify(await r.json().catch(() => ({}))).slice(0, 120)}`);
  return r.json();
};
const get = async (p, t) => (await fetch(API + p, { headers: t ? { authorization: `Bearer ${t}` } : {} })).json();
// every tx hash we collect must be a mined, successful transaction
const txHashes = [];
const assertTx = async (label, hash) => {
  txHashes.push(hash);
  const rc = await provider.getTransactionReceipt(hash);
  ok(`${label} tx mined & succeeded on-chain (status=1)`, rc && rc.status === 1);
};

const SCHEME = 2;
// Scheme 2 = HOUSING (PMAY-Gramin: kutcha/houseless + income <= 180000 + not excluded). Pick a
// farmer who is ALSO housing-eligible so this citizen qualifies for the housing predicate — the
// per-scheme predicate means farmer-status alone no longer implies eligibility for other schemes.
const housingPool = registry.filter(
  (x) => x.profession === 1 && (x.houseStatus === 1 || x.houseStatus === 2) && x.housingExcluded === 0 && (x.income ?? 0) <= 180000,
);
const farmer = housingPool[Math.floor(Math.random() * housingPool.length)].pan;

console.log(`\n### Fresh lifecycle through the backend (scheme ${SCHEME}, PAN ${farmer})`);
const phone = "9" + Math.floor(100000000 + Math.random() * 899999999);
const su = await post("/auth/signup", { phone, password: "verify123", fullName: "OnchainVerify" });
const vr = await post("/auth/verify-otp", { phone, code: su.devCode });
const token0 = vr.tokens.accessToken;
const me = await get("/auth/me", token0);
const addr = me.chainAddress;
console.log(`  citizen chainAddress = ${addr}`);

const app = await post("/applications", { schemeId: SCHEME, pan: farmer }, token0);
const sub = await post(`/applications/${app.id}/submit`, {}, token0);
ok("enrolment APPROVED", sub.status === "APPROVED");
await assertTx("enrolment", sub.txHash);

const admin = (await post("/auth/login", { phone: "9000000000", password: "admin12345" })).tokens.accessToken;
const entBefore = await router.entitlement(SCHEME, addr);
const round = await post("/disbursement/rounds", { schemeId: SCHEME }, admin);
ok(`disbursal round had 0 failed claims (claimed ${round.claimed}/${round.beneficiaryCount})`, round.failed === 0);
await assertTx("installment open", round.createTxHash);
const instAmt = parseEther((await get(`/schemes/${SCHEME}`, admin)).installmentFormatted);
const entAfter = await router.entitlement(SCHEME, addr);
ok("on-chain entitlement increased by exactly one installment", entAfter - entBefore === instAmt);

const vendor = (await get(`/vendors?schemeId=${SCHEME}`, token0))[0];
const payAmt = parseEther("20000");
const payv = await post("/payments", { schemeId: SCHEME, vendorAddress: vendor.address, amount: "20000" }, token0);
await assertTx("payment", payv.payTxHash);
const conf = await post(`/payments/${payv.id}/confirm`, {}, token0);
await assertTx("delivery confirmation", conf.confirmTxHash);
const entPaid = await router.entitlement(SCHEME, addr);
ok("on-chain entitlement reduced by the paid amount", entAfter - entPaid === payAmt);
ok("on-chain: vendor has redeemable (delivered) value", (await router.vendorRedeemable(vendor.address)) >= payAmt);

console.log("\n### API view == direct on-chain read (consistency)");
const apiEnt = (await get("/me/entitlements", token0)).find((e) => e.schemeId === SCHEME);
ok("backend entitlement == on-chain entitlement", parseEther(apiEnt.entitlementFormatted) === entPaid);

console.log("\n### Global on-chain ledger + invariants");
const sc = Number(await schemes.schemeCount());
console.log(`  schemes=${sc}  installments=${await disb.installmentCount()}  payments=${await router.paymentCount()}  redemptions=${await redemption.requestCount()}  e-rupee supply=${formatEther(await token.totalSupply())}`);
let inv = true;
for (let i = 0; i < sc; i++) { const s = await schemes.getScheme(i); if (s.disbursed > s.fund) inv = false; }
ok("invariant: disbursed <= fund for every scheme", inv);

console.log("\n### All collected transactions confirmed on-chain");
let allOk = true;
for (const h of txHashes) { const rc = await provider.getTransactionReceipt(h); if (!rc || rc.status !== 1) allOk = false; }
ok(`every transaction in this lifecycle succeeded (${txHashes.length} txs, 0 reverts)`, allOk);

console.log("\n==========================================");
console.log(`  ON-CHAIN VERIFY: ${pass} passed, ${fail} failed`);
console.log("==========================================");
provider.destroy();
process.exit(fail ? 1 : 0);
