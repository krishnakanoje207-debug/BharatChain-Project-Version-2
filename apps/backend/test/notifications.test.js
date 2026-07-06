"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { NotificationService } = require("../dist/notifications/notification.service");

// No SMTP config → email is simulated (logged), notifications still persist.
const cfg = (map = {}) => ({ get: (k, d) => (k in map ? map[k] : d) });

function make() {
  const saved = [];
  let updated = null;
  const repo = {
    create: (x) => x,
    save: async (x) => {
      saved.push(x);
      return x;
    },
    find: async () => saved,
    update: async (where) => {
      updated = where;
    },
  };
  const svc = new NotificationService(repo, cfg({}));
  return { svc, saved, getUpdated: () => updated };
}

test("notify persists an in-app notification", async () => {
  const { svc, saved } = make();
  await svc.notify({ userId: "u1", type: "payment", title: "Payment sent", body: "₹4000" });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].userId, "u1");
  assert.equal(saved[0].title, "Payment sent");
});

test("notify with an email but no SMTP still persists (simulated email, no throw)", async () => {
  const { svc, saved } = make();
  await svc.notify({ userId: "u1", type: "x", title: "t", body: "b", email: "a@example.in" });
  assert.equal(saved.length, 1);
});

test("markRead updates the row scoped to the user", async () => {
  const { svc, getUpdated } = make();
  await svc.markRead("u1", "n1");
  assert.deepEqual(getUpdated(), { id: "n1", userId: "u1" });
});
