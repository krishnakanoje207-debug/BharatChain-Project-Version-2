"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const shared = require("@bharatchain/shared");

test("vendor category index round-trips the on-chain ordering", () => {
  const order = ["AGRI_INPUT", "EDU_INSTITUTION", "TECH_STORE", "HOUSING_MATERIAL"];
  order.forEach((cat, i) => {
    assert.equal(shared.VENDOR_CATEGORY_BY_INDEX[i], cat);
    assert.equal(shared.vendorCategoryIndex(cat), i);
  });
});

test("scheme→allowed-vendor-category mapping matches the contract gate", () => {
  const m = shared.SCHEME_ALLOWED_VENDOR_CATEGORIES;
  assert.deepEqual(m.AGRICULTURE, ["AGRI_INPUT"]);
  assert.deepEqual(m.EDUCATION, ["EDU_INSTITUTION", "TECH_STORE"]);
  assert.deepEqual(m.HOUSING, ["HOUSING_MATERIAL"]);
  // Sectors with no approved vendor category must be empty (not undefined).
  assert.deepEqual(m.HEALTH, []);
  assert.deepEqual(m.EMPLOYMENT, []);
  assert.deepEqual(m.SOCIAL_WELFARE, []);
});

test("lifecycle enums expose the expected members", () => {
  assert.equal(shared.ApplicationStatus.APPROVED, "APPROVED");
  assert.equal(shared.PaymentStatus.DELIVERED, "DELIVERED");
  assert.equal(shared.RedemptionStatus.PENDING, "PENDING");
  assert.equal(shared.AnomalyType.FAN_IN, "FAN_IN");
  assert.equal(shared.AnomalyStatus.OPEN, "OPEN");
  assert.equal(shared.Role.RBI_ADMIN, "RBI_ADMIN");
});
