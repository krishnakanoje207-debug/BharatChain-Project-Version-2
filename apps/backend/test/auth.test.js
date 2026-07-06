"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { getAddress, dataSlice, id } = require("ethers");
const { AuthService } = require("../dist/auth/auth.service");

const PASS_HASH = bcrypt.hashSync("correct-horse", 8);

function make({ findOne = null, findOneOrFail = null, locked = 0, recordFailure = { locked: false, remaining: 4 } } = {}) {
  const state = { saved: null, reset: false };
  const users = {
    findOne: async () => findOne,
    findOneOrFail: async () => findOneOrFail,
    create: (x) => x,
    save: async (x) => {
      state.saved = x;
      return x;
    },
  };
  const otp = { issue: async () => "123456", verify: async (_s, _p, code) => code === "123456" };
  const tokens = { issue: async () => ({ accessToken: "at", refreshToken: "rt", sid: "s1" }) };
  const lockout = {
    lockedFor: async () => locked,
    recordFailure: async () => recordFailure,
    reset: async () => {
      state.reset = true;
    },
  };
  const audit = { log: async () => {} };
  return { svc: new AuthService(users, otp, tokens, lockout, audit), state };
}

test("signup blocks an already-verified phone", async () => {
  const { svc } = make({ findOne: { phoneVerified: true } });
  await assert.rejects(() => svc.signup({ phone: "9000000001", password: "password1" }), /already exists/i);
});

test("signup returns the dev OTP code", async () => {
  const { svc } = make({ findOne: null });
  const r = await svc.signup({ phone: "9000000002", password: "password1" });
  assert.equal(r.devCode, "123456");
});

test("verifyOtp rejects a wrong code", async () => {
  const { svc } = make({ findOneOrFail: { id: "u1", phoneVerified: false } });
  await assert.rejects(() => svc.verifyOtp("9000000002", "000000"), /invalid or expired/i);
});

test("verifyOtp assigns the deterministic chain address and issues tokens", async () => {
  const { svc, state } = make({ findOneOrFail: { id: "u1", role: "CITIZEN", phoneVerified: false } });
  const r = await svc.verifyOtp("9000000002", "123456");
  assert.equal(r.tokens.accessToken, "at");
  const expected = getAddress(dataSlice(id("u1"), 12));
  assert.equal(state.saved.chainAddress, expected);
  assert.equal(state.saved.phoneVerified, true);
});

test("login is blocked while the account is locked (429)", async () => {
  const { svc } = make({ locked: 600 });
  await assert.rejects(() => svc.login("9000000002", "correct-horse"), (e) => e.getStatus() === 429);
});

test("login with a wrong password records a failure and 401s", async () => {
  const { svc } = make({ findOne: { id: "u1", passwordHash: PASS_HASH, phoneVerified: true } });
  await assert.rejects(() => svc.login("9000000002", "wrong"), /Incorrect phone or password/i);
});

test("login refuses an unverified phone", async () => {
  const { svc } = make({ findOne: { id: "u1", passwordHash: PASS_HASH, phoneVerified: false } });
  await assert.rejects(() => svc.login("9000000002", "correct-horse"), /not verified/i);
});

test("successful login resets lockout and issues tokens", async () => {
  const { svc, state } = make({ findOne: { id: "u1", role: "CITIZEN", passwordHash: PASS_HASH, phoneVerified: true } });
  const r = await svc.login("9000000002", "correct-horse");
  assert.equal(r.tokens.accessToken, "at");
  assert.equal(state.reset, true);
});
