"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseEther } = require("ethers");
const { RedemptionService } = require("../dist/redemption/redemption.service");

const VENDOR = "0x" + "c".repeat(40);

function make({ approved = true, redeemable = parseEther("4000"), stored = null } = {}) {
  const chain = {
    vendorRegistry: { isApproved: async () => approved },
    paymentRouter: { vendorRedeemable: async () => redeemable },
    redemptionController: {
      requestCount: async () => 0n,
      request: async () => ({ wait: async () => ({ hash: "0xreq" }) }),
      approve: async () => ({ wait: async () => ({ hash: "0xapprove" }) }),
      reject: async () => ({ wait: async () => ({ hash: "0xreject" }) }),
    },
    runExclusive: async (fn) => fn(0),
  };
  const redemptions = {
    create: (x) => x,
    save: async (x) => ({ id: "r1", ...x }),
    findOne: async () => stored,
    find: async () => [],
  };
  const vendors = { findOne: async () => ({ name: "Annapurna Agri Inputs" }) };
  const users = { findOne: async () => ({ id: "u1", chainAddress: VENDOR }) };
  const audit = { log: async () => {} };
  return new RedemptionService(redemptions, vendors, users, chain, audit);
}

const dto = (over = {}) => ({ vendorAddress: VENDOR, amount: "4000", itrNumber: "ITR-1", bankAccount: "HDFC-1", ...over });

test("request rejects a zero amount", async () => {
  await assert.rejects(() => make().request("admin", dto({ amount: "0" })), /greater than zero/i);
});

test("request rejects an unapproved vendor", async () => {
  await assert.rejects(() => make({ approved: false }).request("admin", dto()), /not approved/i);
});

test("request rejects more than the redeemable balance", async () => {
  await assert.rejects(() => make({ redeemable: parseEther("1000") }).request("admin", dto({ amount: "4000" })), /Exceeds redeemable/i);
});

test("request files a PENDING redemption capturing ITR", async () => {
  const r = await make().request("admin", dto());
  assert.equal(r.status, "PENDING");
  assert.equal(r.onChainId, 0);
  assert.equal(r.itrNumber, "ITR-1");
  assert.equal(r.requestTxHash, "0xreq");
});

test("approve burns + records a simulated NEFT payout reference", async () => {
  const svc = make({ stored: { id: "r1", onChainId: 0, status: "PENDING", amount: parseEther("4000").toString(), vendorAddress: VENDOR } });
  const r = await svc.approve("rbi", "r1");
  assert.equal(r.status, "APPROVED");
  assert.equal(r.decidedBy, "rbi");
  assert.match(r.payoutReference, /^NEFT-/);
  assert.equal(r.decisionTxHash, "0xapprove");
});

test("approve rejects a non-pending request", async () => {
  const svc = make({ stored: { id: "r1", onChainId: 0, status: "APPROVED" } });
  await assert.rejects(() => svc.approve("rbi", "r1"), /already/i);
});

test("reject records the reason and REJECTED status", async () => {
  const svc = make({ stored: { id: "r1", onChainId: 0, status: "PENDING", amount: "1", vendorAddress: VENDOR } });
  const r = await svc.reject("rbi", "r1", "fake invoices");
  assert.equal(r.status, "REJECTED");
  assert.equal(r.decisionReason, "fake invoices");
});

test("approve 404s an unknown request", async () => {
  await assert.rejects(() => make({ stored: null }).approve("rbi", "nope"), /not found/i);
});

test("requestSelf derives the vendor address from the caller", async () => {
  const r = await make().requestSelf("u1", { amount: "4000", itrNumber: "ITR-9" });
  assert.equal(r.status, "PENDING");
  assert.equal(r.vendorAddress.toLowerCase(), VENDOR.toLowerCase());
  assert.equal(r.itrNumber, "ITR-9");
});

test("redeemableFor reports the approved vendor's redeemable balance", async () => {
  const out = await make({ redeemable: parseEther("2500") }).redeemableFor("u1");
  assert.equal(out.approved, true);
  assert.equal(out.redeemableFormatted, "2500.0");
});

test("redeemableFor reports approved=false for an unapproved vendor", async () => {
  const out = await make({ approved: false }).redeemableFor("u1");
  assert.equal(out.approved, false);
  assert.equal(out.redeemable, "0");
});
