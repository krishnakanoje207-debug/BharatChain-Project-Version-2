"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { AnomalyService } = require("../dist/anomaly/anomaly.service");

const cfg = (map = {}) => ({ get: (k, d) => (k in map ? map[k] : d) });

/**
 * Build an AnomalyService with mocks. `distinct` drives fan-in, `count` drives
 * velocity, `existingOpen` simulates a prior OPEN anomaly (dedup), and admins
 * receive notifications.
 */
function makeService({ distinct = 0, count = 0, existingOpen = null, admins = [] } = {}) {
  const saved = [];
  const notified = [];
  const qb = {
    select: () => qb,
    where: () => qb,
    andWhere: () => qb,
    getRawOne: async () => ({ distinct: String(distinct) }),
    getCount: async () => count,
  };
  const anomalies = {
    findOne: async () => existingOpen,
    create: (x) => x,
    save: async (x) => {
      saved.push(x);
      return { id: "a1", ...x };
    },
    find: async () => saved,
  };
  const payments = { createQueryBuilder: () => qb };
  const users = { find: async () => admins };
  const kafka = { consume: async () => {} };
  const notifications = { notify: async (n) => notified.push(n) };
  const audit = { log: async () => {} };
  const svc = new AnomalyService(anomalies, payments, users, kafka, notifications, audit, cfg());
  return { svc, saved, notified };
}

const evt = (over = {}) => ({
  type: "payment.paid",
  paymentId: 1,
  userId: "u1",
  citizen: "0xcitizen",
  vendorAddress: "0xVendor",
  vendorName: "Annapurna Agri Inputs",
  schemeId: 0,
  amount: "1000",
  ts: Date.now(),
  ...over,
});

test("fan-in + velocity both raised above thresholds", async () => {
  const { svc, saved, notified } = makeService({ distinct: 5, count: 7, admins: [{ id: "adm", role: "ADMIN", email: null }] });
  await svc.onPaymentEvent(evt());
  const types = saved.map((a) => a.type).sort();
  assert.deepEqual(types, ["FAN_IN", "VELOCITY"]);
  assert.equal(notified.length, 2); // one alert per raised anomaly to the admin
});

test("nothing raised below thresholds", async () => {
  const { svc, saved, notified } = makeService({ distinct: 2, count: 4, admins: [{ id: "adm", role: "ADMIN" }] });
  await svc.onPaymentEvent(evt());
  assert.equal(saved.length, 0);
  assert.equal(notified.length, 0);
});

test("dedup: an existing OPEN signal is refreshed, not re-alerted", async () => {
  const existing = { id: "a1", type: "FAN_IN", status: "OPEN", save: undefined };
  const { svc, notified } = makeService({ distinct: 9, count: 0, existingOpen: existing, admins: [{ id: "adm", role: "ADMIN" }] });
  await svc.onPaymentEvent(evt());
  assert.equal(notified.length, 0); // deduped → no new admin alert
});

test("self-deal flagged when citizen == vendor address", async () => {
  const { svc, saved } = makeService({ distinct: 0, count: 0, admins: [] });
  await svc.onPaymentEvent(evt({ citizen: "0xSAME", vendorAddress: "0xSAME" }));
  assert.ok(saved.some((a) => a.type === "SELF_DEAL"));
});

test("non-payment events are ignored", async () => {
  const { svc, saved } = makeService({ distinct: 9, count: 9 });
  await svc.onPaymentEvent(evt({ type: "something.else" }));
  assert.equal(saved.length, 0);
});
