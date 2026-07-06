"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseEther } = require("ethers");
const { DisbursementService } = require("../dist/disbursement/disbursement.service");

const ADDR = "0x" + "a".repeat(40);

function make({ scheme, beneficiaries = [], lastRound = null } = {}) {
  const updated = [];
  const claims = [];
  const apps = {
    find: async () => beneficiaries,
    update: async (where, patch) => updated.push({ where, patch }),
  };
  const rounds = { create: (x) => x, save: async (x) => ({ id: "rd1", ...x }), findOne: async () => lastRound };
  const chain = {
    disbursementController: {
      installmentCount: async () => 0n,
      createInstallment: async () => ({ wait: async () => ({ hash: "0xcreate" }) }),
      claim: async (installmentId, citizen, amount) => {
        claims.push({ citizen, amount });
        return { wait: async () => ({ hash: "0xclaim" }) };
      },
    },
    runExclusive: async (fn) => fn(0),
  };
  const schemes = { getOne: async () => scheme };
  const audit = { log: async () => {} };
  const notifications = { notify: async () => {} };
  const svc = new DisbursementService(apps, rounds, chain, schemes, audit, notifications);
  return { svc, updated, claims };
}

const activeScheme = (over = {}) => ({
  name: "PM-Kisan Samman Nidhi",
  active: true,
  installmentAmount: parseEther("10000").toString(),
  remaining: parseEther("1000000").toString(),
  ...over,
});

test("rejects an inactive scheme", async () => {
  const { svc } = make({ scheme: activeScheme({ active: false }) });
  await assert.rejects(() => svc.runRound(0), /not active/i);
});

test("rejects when nobody is due the installment", async () => {
  const { svc } = make({ scheme: activeScheme(), beneficiaries: [] });
  await assert.rejects(() => svc.runRound(0), /already received installment/i);
});

test("installment number advances per round (1 -> 2)", async () => {
  const { svc } = make({
    scheme: activeScheme(),
    beneficiaries: [{ id: "a1", user: { id: "u1", chainAddress: ADDR } }],
    lastRound: { installmentNo: 1 },
  });
  const r = await svc.runRound(0, "admin"); // advance from level 1
  assert.equal(r.installmentNo, 2);
});

test("catchup mode does not advance the installment level", async () => {
  const { svc } = make({
    scheme: activeScheme(),
    beneficiaries: [{ id: "a1", user: { id: "u1", chainAddress: ADDR } }],
    lastRound: { installmentNo: 2 },
  });
  const r = await svc.runRound(0, "cron", "catchup"); // stays at level 2
  assert.equal(r.installmentNo, 2);
});

test("catchup with no installment issued yet is rejected", async () => {
  const { svc } = make({ scheme: activeScheme(), beneficiaries: [{ id: "a1", user: { id: "u1", chainAddress: ADDR } }], lastRound: null });
  await assert.rejects(() => svc.runRound(0, "cron", "catchup"), /no installment has been issued/i);
});

test("rejects a zero installment amount", async () => {
  const { svc } = make({
    scheme: activeScheme({ installmentAmount: "0" }),
    beneficiaries: [{ id: "a1", user: { id: "u1", chainAddress: ADDR } }],
  });
  await assert.rejects(() => svc.runRound(0), /installment amount is zero/i);
});

test("guards against over-allocating an exhausted fund", async () => {
  const { svc } = make({
    scheme: activeScheme({ remaining: "0" }),
    beneficiaries: [{ id: "a1", user: { id: "u1", chainAddress: ADDR } }],
  });
  await assert.rejects(() => svc.runRound(0), /fund exhausted/i);
});

test("happy round opens an installment, claims, and marks beneficiaries disbursed", async () => {
  const { svc, updated } = make({
    scheme: activeScheme(),
    beneficiaries: [{ id: "a1", disbursementCount: 0, user: { id: "u1", chainAddress: ADDR, email: null } }],
  });
  const r = await svc.runRound(0, "admin");
  assert.equal(r.beneficiaryCount, 1);
  assert.equal(r.claimedCount, 1);
  assert.equal(r.failed, 0);
  assert.equal(r.createTxHash, "0xcreate");
  // claimed beneficiary is set to the current installment level (over-disbursal guard).
  assert.equal(updated.length, 1);
  assert.equal(updated[0].patch.disbursementCount, 1);
});

test("late enrollee is caught up to the full cumulative entitlement in one round", async () => {
  // Issuing installment 3 to a citizen who has received 0 so far pays 3 installments
  // at once (full catch-up), while a citizen already at 2 receives just 1 more.
  const { svc, updated, claims } = make({
    scheme: activeScheme(),
    beneficiaries: [
      { id: "late", disbursementCount: 0, user: { id: "uL", chainAddress: "0x" + "b".repeat(40), email: null } },
      { id: "ontime", disbursementCount: 2, user: { id: "uO", chainAddress: "0x" + "c".repeat(40), email: null } },
    ],
    lastRound: { installmentNo: 2 },
  });
  const r = await svc.runRound(0, "admin"); // advance to installment 3
  assert.equal(r.installmentNo, 3);
  assert.equal(r.claimedCount, 2);
  const late = claims.find((c) => c.citizen === "0x" + "b".repeat(40));
  const ontime = claims.find((c) => c.citizen === "0x" + "c".repeat(40));
  assert.equal(late.amount, parseEther("30000")); // 3 installments at once
  assert.equal(ontime.amount, parseEther("10000")); // just the one it was due
  // both end caught up to level 3
  assert.equal(updated[0].patch.disbursementCount, 3);
});

test("never advances or pays past the scheme cap (maxInstallments)", async () => {
  // Scheme capped at 3 installments. Already at the cap, an "advance" stays at 3 and
  // only catches a straggler up to the cap — it never creates a 4th installment.
  const { svc, updated, claims } = make({
    scheme: activeScheme({ maxInstallments: 3 }),
    beneficiaries: [
      { id: "straggler", disbursementCount: 0, user: { id: "uS", chainAddress: "0x" + "d".repeat(40), email: null } },
    ],
    lastRound: { installmentNo: 3 },
  });
  const r = await svc.runRound(0, "admin");
  assert.equal(r.installmentNo, 3); // capped, did NOT advance to 4
  assert.equal(r.claimedCount, 1);
  assert.equal(claims[0].amount, parseEther("30000")); // straggler caught up to the cap in one round
  assert.equal(updated[0].patch.disbursementCount, 3);
});

test("rejects a round once every beneficiary has reached the cap", async () => {
  const { svc } = make({
    scheme: activeScheme({ maxInstallments: 3 }),
    beneficiaries: [], // find() filters out everyone already at disbursementCount = 3
    lastRound: { installmentNo: 3 },
  });
  await assert.rejects(() => svc.runRound(0, "admin"), /full 3 installments/i);
});
