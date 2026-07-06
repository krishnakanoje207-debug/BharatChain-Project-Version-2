"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseEther } = require("ethers");
const { MeService } = require("../dist/me/me.service");
const { ApplicationStatus } = require("@bharatchain/shared");

function make({ user, apps = [], entitlementWei = 0n } = {}) {
  const users = { findOne: async () => user };
  const appsRepo = { find: async () => apps };
  const chain = { paymentRouter: { entitlement: async () => entitlementWei } };
  const schemes = { getOne: async () => ({ name: "PM-Kisan Samman Nidhi" }) };
  return new MeService(users, appsRepo, chain, schemes);
}

test("entitlements is empty for a user without an on-chain identity", async () => {
  const svc = make({ user: { id: "u1", chainAddress: null } });
  assert.deepEqual(await svc.entitlements("u1"), []);
});

test("entitlements reports the on-chain balance per approved scheme", async () => {
  const svc = make({
    user: { id: "u1", chainAddress: "0x" + "a".repeat(40) },
    apps: [{ schemeId: 0, status: ApplicationStatus.APPROVED }],
    entitlementWei: parseEther("6500"),
  });
  const out = await svc.entitlements("u1");
  assert.equal(out.length, 1);
  assert.equal(out[0].schemeName, "PM-Kisan Samman Nidhi");
  assert.equal(out[0].entitlementFormatted, "6500.0");
});

test("entitlements 404s an unknown user", async () => {
  const svc = make({ user: null });
  await assert.rejects(() => svc.entitlements("nope"), /not found/i);
});
