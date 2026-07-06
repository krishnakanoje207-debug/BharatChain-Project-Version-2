"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseEther } = require("ethers");
const { SchemesService } = require("../dist/schemes/schemes.service");

const SCHEMES = [
  { name: "PM-Kisan Samman Nidhi", category: 0n, fund: parseEther("100"), installmentAmount: parseEther("10"), disbursed: 0n, active: true },
  { name: "Vidya Lakshmi Scholarship", category: 1n, fund: parseEther("50"), installmentAmount: parseEther("5"), disbursed: 0n, active: true },
  { name: "PM Awas Yojana", category: 2n, fund: parseEther("80"), installmentAmount: parseEther("5"), disbursed: 0n, active: false },
];

function make() {
  const chain = {
    schemeRegistry: {
      schemeCount: async () => BigInt(SCHEMES.length),
      getScheme: async (id) => SCHEMES[Number(id)],
    },
  };
  const cache = { find: async () => [], findOne: async () => null };
  return new SchemesService(cache, chain);
}

test("browse returns only active schemes grouped by category", async () => {
  const groups = await make().browse();
  const cats = groups.map((g) => g.category);
  assert.deepEqual(cats, ["AGRICULTURE", "EDUCATION"]); // housing is inactive, excluded
});

test("browse includeInactive surfaces the inactive scheme", async () => {
  const groups = await make().browse({ includeInactive: true });
  assert.ok(groups.map((g) => g.category).includes("HOUSING"));
});

test("browse filters by category", async () => {
  const groups = await make().browse({ category: "AGRICULTURE" });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].schemes[0].name, "PM-Kisan Samman Nidhi");
});

test("browse free-text search matches scheme name", async () => {
  const groups = await make().browse({ q: "vidya" });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].category, "EDUCATION");
});

test("getOne returns a scheme view with formatted amounts", async () => {
  const s = await make().getOne(0);
  assert.equal(s.name, "PM-Kisan Samman Nidhi");
  assert.equal(s.category, "AGRICULTURE");
  assert.equal(s.fundFormatted, "100.0");
  assert.equal(s.remainingFormatted, "100.0");
});

test("getOne rejects an out-of-range scheme id", async () => {
  await assert.rejects(() => make().getOne(99), /Unknown scheme/i);
});
