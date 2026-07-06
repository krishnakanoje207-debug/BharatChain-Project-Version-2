"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { VendorsService } = require("../dist/vendors/vendors.service");

const AGRI = [
  { address: "0x" + "a".repeat(40), name: "Annapurna Agri Inputs", category: "AGRI_INPUT", city: "Nagpur", approved: true },
  { address: "0x" + "b".repeat(40), name: "Krishi Seva Kendra", category: "AGRI_INPUT", city: "Bhopal", approved: true },
];

/**
 * allowedIdx: vendor-category indices the scheme's ON-CHAIN allow-list contains
 * (0 AGRI_INPUT | 1 EDU_INSTITUTION | 2 TECH_STORE | 3 HOUSING_MATERIAL).
 * enrolled: addresses ZK-enrolled into the scheme (defaults to all rows).
 */
function make({ scheme = { category: "AGRICULTURE" }, rows = AGRI, allowedIdx = [0], enrolled } = {}) {
  const calls = [];
  const enrolledSet = new Set(enrolled ?? rows.map((r) => r.address));
  const vendors = {
    find: async (opts) => {
      calls.push(opts);
      return rows;
    },
  };
  const chain = {
    schemeRegistry: { isVendorCategoryAllowed: async (_id, idx) => allowedIdx.includes(idx) },
    vendorEnrollmentRegistry: { isEnrolled: async (_id, addr) => enrolledSet.has(addr) },
  };
  const schemes = { getOne: async () => scheme };
  return { svc: new VendorsService(vendors, chain, schemes), calls };
}

test("list maps approved vendors to a public view", async () => {
  const { svc } = make();
  const out = await svc.list();
  assert.equal(out.length, 2);
  assert.deepEqual(Object.keys(out[0]).sort(), ["address", "category", "city", "name"]);
});

test("listForScheme returns vendors allowed by the scheme's ON-CHAIN categories", async () => {
  const { svc, calls } = make({ allowedIdx: [0] });
  const out = await svc.listForScheme(0);
  assert.equal(out.length, 2);
  assert.equal(out[0].category, "AGRI_INPUT");
  assert.ok(calls.length === 1); // queried the DB for the allowed categories
});

test("listForScheme honours a NON-default on-chain allow-list (admin-created scheme)", async () => {
  // A HEALTH-sector scheme whose admin allowed AGRI_INPUT on-chain must still list them.
  const { svc } = make({ scheme: { category: "HEALTH" }, allowedIdx: [0] });
  const out = await svc.listForScheme(3);
  assert.equal(out.length, 2);
});

test("listForScheme returns nothing when the on-chain allow-list is empty", async () => {
  const { svc, calls } = make({ allowedIdx: [] });
  const out = await svc.listForScheme(3);
  assert.deepEqual(out, []);
  assert.equal(calls.length, 0); // short-circuits without hitting the DB
});

test("listForScheme hides approved-but-not-ZK-enrolled vendors (unpayable)", async () => {
  const { svc } = make({ allowedIdx: [0], enrolled: [AGRI[0].address] });
  const out = await svc.listForScheme(0);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "Annapurna Agri Inputs");
});
