"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { LockoutService } = require("../dist/auth/lockout.service");
const { RateLimitService } = require("../dist/common/rate-limit.service");
const { OtpService } = require("../dist/auth/otp.service");

/** Minimal in-memory Redis supporting the ops these services use. */
function fakeRedis() {
  const store = new Map();
  const ttls = new Map();
  return {
    async incr(k) { const n = (Number(store.get(k)) || 0) + 1; store.set(k, String(n)); return n; },
    async expire(k, s) { ttls.set(k, s); return 1; },
    async set(k, v, ex, secs) { store.set(k, String(v)); if (ex === "EX") ttls.set(k, secs); return "OK"; },
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async del(...keys) { let c = 0; for (const k of keys) { if (store.delete(k)) c++; ttls.delete(k); } return c; },
    async ttl(k) { return ttls.has(k) ? ttls.get(k) : store.has(k) ? -1 : -2; },
  };
}

const cfg = (map = {}) => ({ get: (k, d) => (k in map ? map[k] : d) });

// ---- LockoutService ----

test("lockout counts down remaining attempts then locks at the threshold", async () => {
  const svc = new LockoutService(fakeRedis());
  const phone = "9000000001";
  for (let i = 1; i <= 4; i++) {
    const r = await svc.recordFailure(phone);
    assert.equal(r.locked, false);
    assert.equal(r.remaining, 5 - i);
  }
  const fifth = await svc.recordFailure(phone);
  assert.equal(fifth.locked, true);
  assert.equal(fifth.remaining, 0);
});

test("lockedFor reports the lock TTL, and reset clears it", async () => {
  const redis = fakeRedis();
  const svc = new LockoutService(redis);
  const phone = "9000000002";
  for (let i = 0; i < 5; i++) await svc.recordFailure(phone);
  assert.equal(await svc.lockedFor(phone), 900);
  await svc.reset(phone);
  assert.equal(await svc.lockedFor(phone), 0);
});

// ---- RateLimitService ----

test("rate limiter allows up to the limit then blocks", async () => {
  const svc = new RateLimitService(fakeRedis());
  const results = [];
  for (let i = 0; i < 4; i++) results.push(await svc.allow("otp", "9000000003", 3, 600));
  assert.deepEqual(results, [true, true, true, false]);
});

test("rate limiter buckets are independent per id", async () => {
  const svc = new RateLimitService(fakeRedis());
  assert.equal(await svc.allow("otp", "A", 1, 600), true);
  assert.equal(await svc.allow("otp", "A", 1, 600), false);
  assert.equal(await svc.allow("otp", "B", 1, 600), true); // different id, fresh bucket
});

// ---- OtpService ----

test("OTP issue returns a 6-digit code in dev and verifies once (single use)", async () => {
  const svc = new OtpService(fakeRedis(), cfg({ NODE_ENV: "development" }));
  const code = await svc.issue("signup", "9000000004");
  assert.match(code, /^\d{6}$/);
  assert.equal(await svc.verify("signup", "9000000004", code), true);
  assert.equal(await svc.verify("signup", "9000000004", code), false); // consumed
});

test("OTP verify rejects a wrong code", async () => {
  const svc = new OtpService(fakeRedis(), cfg({ NODE_ENV: "development" }));
  await svc.issue("signup", "9000000005");
  assert.equal(await svc.verify("signup", "9000000005", "000000"), false);
});

test("OTP does not leak the code in production", async () => {
  const svc = new OtpService(fakeRedis(), cfg({ NODE_ENV: "production" }));
  assert.equal(await svc.issue("signup", "9000000006"), undefined);
});
