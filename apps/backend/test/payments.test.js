"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseEther } = require("ethers");
const { PaymentsService } = require("../dist/payments/payments.service");

const VENDOR = "0x" + "a".repeat(40);
const CITIZEN = "0x" + "b".repeat(40);

/** PaymentsService with mocks. Knobs flip each guard. */
function make({
  user = { id: "u1", chainAddress: CITIZEN, email: null },
  entitlement = parseEther("10000"),
  approved = true,
  categoryAllowed = true,
  enrolled = true,
  storedPayment = null,
} = {}) {
  const emitted = [];
  const chain = {
    paymentRouter: {
      entitlement: async () => entitlement,
      paymentCount: async () => 0n,
      pay: async () => ({ wait: async () => ({ hash: "0xpay" }) }),
      confirmDelivery: async () => ({ wait: async () => ({ hash: "0xconfirm" }) }),
    },
    vendorRegistry: { isApproved: async () => approved, categoryOf: async () => 0n },
    vendorEnrollmentRegistry: { isEnrolled: async () => enrolled },
    schemeRegistry: { isVendorCategoryAllowed: async () => categoryAllowed },
    runExclusive: async (fn) => fn(0),
  };
  const payments = {
    create: (x) => x,
    save: async (x) => ({ id: "p1", ...x }),
    findOne: async () => storedPayment,
  };
  const users = { findOne: async () => user };
  const vendors = { findOne: async () => ({ address: VENDOR, name: "Annapurna Agri Inputs" }) };
  const schemes = { getOne: async () => ({ name: "PM-Kisan Samman Nidhi", category: "AGRICULTURE" }) };
  const audit = { log: async () => {} };
  const notifications = { notify: async () => {} };
  const kafka = { emit: async (...a) => emitted.push(a) };
  const svc = new PaymentsService(payments, users, vendors, chain, schemes, audit, notifications, kafka);
  return { svc, emitted };
}

test("rejects when the user has no on-chain identity", async () => {
  const { svc } = make({ user: { id: "u1", chainAddress: null } });
  await assert.rejects(() => svc.pay("u1", 0, VENDOR, "1000"), /on-chain identity/i);
});

test("rejects a zero amount", async () => {
  const { svc } = make();
  await assert.rejects(() => svc.pay("u1", 0, VENDOR, "0"), /greater than zero/i);
});

test("rejects when entitlement is insufficient", async () => {
  const { svc } = make({ entitlement: parseEther("100") });
  await assert.rejects(() => svc.pay("u1", 0, VENDOR, "1000"), /Insufficient entitlement/i);
});

test("rejects an unapproved vendor", async () => {
  const { svc } = make({ approved: false });
  await assert.rejects(() => svc.pay("u1", 0, VENDOR, "1000"), /not approved/i);
});

test("rejects a category-disallowed vendor (the scheme gate)", async () => {
  const { svc } = make({ categoryAllowed: false });
  await assert.rejects(() => svc.pay("u1", 0, VENDOR, "1000"), /not allowed/i);
});

test("rejects a vendor not ZK-enrolled in the scheme (the per-scheme gate)", async () => {
  const { svc } = make({ enrolled: false });
  await assert.rejects(() => svc.pay("u1", 0, VENDOR, "1000"), /not ZK-enrolled/i);
});

test("happy path pays, returns PAID, and emits a Kafka event", async () => {
  const { svc, emitted } = make();
  const r = await svc.pay("u1", 0, VENDOR, "4000");
  assert.equal(r.status, "PAID");
  assert.equal(r.onChainId, 0);
  assert.equal(r.amountFormatted, "4000.0");
  assert.equal(r.vendorName, "Annapurna Agri Inputs");
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0][2].type, "payment.paid"); // (topic, key, value)
});

test("confirmDelivery rejects someone else's payment", async () => {
  const { svc } = make({ storedPayment: { id: "p1", userId: "other", status: "PAID", onChainId: 0 } });
  await assert.rejects(() => svc.confirmDelivery("u1", "p1"), /not your payment/i);
});

test("confirmDelivery rejects an already-delivered payment", async () => {
  const { svc } = make({ storedPayment: { id: "p1", userId: "u1", status: "DELIVERED", onChainId: 0 } });
  await assert.rejects(() => svc.confirmDelivery("u1", "p1"), /already/i);
});

test("confirmDelivery moves PAID → DELIVERED", async () => {
  const { svc } = make({ storedPayment: { id: "p1", userId: "u1", status: "PAID", onChainId: 0, amount: parseEther("4000").toString(), vendorAddress: VENDOR } });
  const r = await svc.confirmDelivery("u1", "p1");
  assert.equal(r.status, "DELIVERED");
  assert.equal(r.confirmTxHash, "0xconfirm");
});
