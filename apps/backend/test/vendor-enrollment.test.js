"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { VendorEnrollmentService } = require("../dist/vendors/vendor-enrollment.service");

const VENDOR = "0x" + "a".repeat(40);

/** VendorEnrollmentService with mocks. Knobs flip each guard. */
function make({
  vendor = { address: VENDOR, name: "Annapurna Agri Inputs", category: "AGRI_INPUT" },
  categoryAllowed = true,
  alreadyEnrolled = false,
  inRegistry = true,
  proveThrows = false,
} = {}) {
  const calls = { enrolled: [] };
  const chain = {
    schemeRegistry: {
      isVendorCategoryAllowed: async () => categoryAllowed,
      schemeCount: async () => 3n,
    },
    vendorEnrollmentRegistry: { isEnrolled: async () => alreadyEnrolled },
    vendorZkEnroller: {
      enrollVendorWithProof: async (...a) => {
        calls.enrolled.push(a);
        return { wait: async () => ({ hash: "0xvenroll" }) };
      },
    },
    runExclusive: async (fn) => fn(0),
  };
  const vendors = { findOne: async () => vendor };
  const schemes = { getOne: async () => ({ name: "PM-Kisan Samman Nidhi" }) };
  const vendorRegistry = {
    findByName: async () => (inRegistry ? { record: { name: vendor?.name }, index: 0 } : null),
    proveVendorEligibility: async () => {
      if (proveThrows) throw new Error("Business not eligible (lapsed licence or category mismatch).");
      return { a: ["1", "2"], b: [["3", "4"], ["5", "6"]], c: ["7", "8"], signals: ["9", "10", "0", "0"] };
    },
  };
  const svc = new VendorEnrollmentService(vendors, chain, schemes, vendorRegistry);
  return { svc, calls };
}

test("enrolls an eligible vendor and relays the proof", async () => {
  const { svc, calls } = make();
  const r = await svc.enrollVendor(VENDOR, 0);
  assert.equal(r.enrolled, true);
  assert.equal(r.txHash, "0xvenroll");
  assert.equal(calls.enrolled.length, 1);
  assert.equal(calls.enrolled[0][0], 0); // schemeId
  assert.equal(calls.enrolled[0][2], 0); // requiredCategory (AGRI_INPUT index)
});

test("is idempotent — skips when already enrolled on-chain", async () => {
  const { svc, calls } = make({ alreadyEnrolled: true });
  const r = await svc.enrollVendor(VENDOR, 0);
  assert.equal(r.alreadyEnrolled, true);
  assert.equal(calls.enrolled.length, 0); // no on-chain tx
});

test("rejects when the scheme does not allow the vendor's category", async () => {
  const { svc } = make({ categoryAllowed: false });
  await assert.rejects(() => svc.enrollVendor(VENDOR, 0), /does not allow/i);
});

test("rejects a vendor missing from the business registry", async () => {
  const { svc } = make({ inRegistry: false });
  await assert.rejects(() => svc.enrollVendor(VENDOR, 0), /not in the government business registry/i);
});

test("surfaces an ineligible (lapsed-licence) proof failure as 400", async () => {
  const { svc } = make({ proveThrows: true });
  await assert.rejects(() => svc.enrollVendor(VENDOR, 0), /not eligible/i);
});

test("rejects an unknown vendor", async () => {
  const { svc } = make({ vendor: null });
  await assert.rejects(() => svc.enrollVendor(VENDOR, 0), /not found/i);
});

test("enrollVendorIntoMatchingSchemes enrolls only category-allowed schemes", async () => {
  // isVendorCategoryAllowed=true for all 3 schemes → 3 enrollments
  const { svc, calls } = make();
  const results = await svc.enrollVendorIntoMatchingSchemes(VENDOR);
  assert.equal(results.length, 3);
  assert.equal(calls.enrolled.length, 3);
});
