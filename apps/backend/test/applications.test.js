"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ApplicationsService } = require("../dist/applications/applications.service");
const { IneligibleError } = require("../dist/registry/registry.service");

const ADDR = "0x" + "a".repeat(40);
const RECORD = { pan: "ABCDE1234F", kissan: "KCC100005", land: "LR200005", name: "Ramesh Naidu", state: "Tamil Nadu" };

function make({
  user = { id: "u1", chainAddress: ADDR, email: null },
  scheme = { active: true, name: "PM-Kisan Samman Nidhi", category: "AGRICULTURE" },
  match = { index: 5, record: RECORD },
  appsFindOne = null,
  proof = { a: 1, b: 2, c: 3, signals: [], nullifier: "0xnull" },
  proveThrows = null,
  enrollThrows = null,
} = {}) {
  const apps = {
    findOne: async () => appsFindOne,
    findOneOrFail: async () => user,
    create: (x) => x,
    save: async (x) => ({ id: "a1", ...x }),
    delete: async () => undefined,
  };
  const docs = {
    create: (x) => x,
    save: async (x) => ({ id: "d1", ...x }),
    createQueryBuilder: () => ({ delete: () => ({ where: () => ({ execute: async () => undefined }) }) }),
  };
  const users = { findOneOrFail: async () => user };
  const chain = {
    runExclusive: async (fn) => fn(0),
    schemeRegistry: { categoryOf: async () => 0n },
    zkEnroller: {
      enrollWithProof: async () => {
        if (enrollThrows) throw enrollThrows;
        return { wait: async () => ({ hash: "0xenroll" }) };
      },
    },
  };
  const schemes = { getOne: async () => scheme };
  const storage = { putDocument: async () => "objkey" };
  const registry = {
    findByPan: async () => match,
    recordAt: async () => RECORD,
    proveEligibility: async () => {
      if (proveThrows) throw proveThrows;
      return proof;
    },
  };
  const audit = { log: async () => {} };
  const notifications = { notify: async () => {} };
  return new ApplicationsService(apps, docs, users, chain, schemes, storage, registry, audit, notifications);
}

// ---- create (PAN match + document cross-check) ----

test("create rejects a PAN not in the registry", async () => {
  await assert.rejects(() => make({ match: null }).create("u1", { schemeId: 0, pan: "ZZZZZ0000Z" }), /not found in the government registry/i);
});

test("create rejects a mismatched Kissan card number", async () => {
  await assert.rejects(
    () => make().create("u1", { schemeId: 0, pan: RECORD.pan, kissan: "KCC999999" }),
    /Kissan card number does not match/i,
  );
});

test("create blocks an in-progress (PENDING) duplicate", async () => {
  await assert.rejects(() => make({ appsFindOne: { id: "existing", status: "PENDING" } }).create("u1", { schemeId: 0, pan: RECORD.pan }), /in progress/i);
});

test("create blocks re-applying once APPROVED (already enrolled)", async () => {
  await assert.rejects(() => make({ appsFindOne: { id: "existing", status: "APPROVED" } }).create("u1", { schemeId: 0, pan: RECORD.pan }), /already enrolled/i);
});

test("create ALLOWS re-apply after a REJECTED attempt", async () => {
  const r = await make({ appsFindOne: { id: "old", status: "REJECTED" } }).create("u1", { schemeId: 0, pan: RECORD.pan });
  assert.equal(r.status, "PENDING");
});

test("create rejects an inactive scheme", async () => {
  await assert.rejects(() => make({ scheme: { active: false } }).create("u1", { schemeId: 0, pan: RECORD.pan }), /not currently active/i);
});

test("create succeeds and matches the registry record", async () => {
  const r = await make().create("u1", { schemeId: 0, pan: RECORD.pan });
  assert.equal(r.status, "PENDING");
  assert.equal(r.applicant.name, "Ramesh Naidu");
});

// ---- submit (ZK eligibility gate) ----

// Fresh object per test — submit() mutates the application's status in place.
const freshApp = () => ({ id: "a1", user: { id: "u1", chainAddress: ADDR, email: null }, status: "PENDING", registryIndex: 5, schemeId: 0 });

test("submit rejects an ineligible applicant (proof fails)", async () => {
  const svc = make({ appsFindOne: freshApp(), proveThrows: new IneligibleError("Not a registered farmer.") });
  const r = await svc.submit("u1", "a1");
  assert.equal(r.status, "REJECTED");
  assert.match(r.reason, /Not a registered farmer/);
});

test("submit enrolls an eligible applicant on-chain (APPROVED)", async () => {
  const svc = make({ appsFindOne: freshApp() });
  const r = await svc.submit("u1", "a1");
  assert.equal(r.status, "APPROVED");
  assert.equal(r.txHash, "0xenroll");
  assert.equal(r.nullifier, "0xnull");
});

test("submit maps an on-chain revert to REJECTED with the revert name", async () => {
  const svc = make({ appsFindOne: freshApp(), enrollThrows: { revert: { name: "NullifierUsed" } } });
  const r = await svc.submit("u1", "a1");
  assert.equal(r.status, "REJECTED");
  assert.match(r.reason, /NullifierUsed/);
});

test("submit forbids acting on someone else's application", async () => {
  const app = freshApp();
  app.user = { id: "other", chainAddress: ADDR };
  const svc = make({ appsFindOne: app });
  await assert.rejects(() => svc.submit("u1", "a1"), /not your application/i);
});
