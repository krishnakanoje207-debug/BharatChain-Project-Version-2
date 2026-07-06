"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { BhashiniService, LANGUAGES } = require("../dist/assistant/bhashini.service");

const cfg = (map) => ({ get: (k, d) => (k in map ? map[k] : d) });

test("not available without credentials", () => {
  const svc = new BhashiniService(cfg({}));
  assert.equal(svc.available, false);
});

test("available when both creds set", () => {
  const svc = new BhashiniService(cfg({ BHASHINI_USER_ID: "u", BHASHINI_API_KEY: "k" }));
  assert.equal(svc.available, true);
});

test("translate is a passthrough without credentials", async () => {
  const svc = new BhashiniService(cfg({}));
  assert.equal(await svc.translate("hello", "en", "hi"), "hello");
});

test("translate returns input unchanged when source==target", async () => {
  const svc = new BhashiniService(cfg({ BHASHINI_USER_ID: "u", BHASHINI_API_KEY: "k" }));
  assert.equal(await svc.translate("hello", "en", "en"), "hello");
});

test("language support + names", () => {
  const svc = new BhashiniService(cfg({}));
  assert.ok(svc.isSupported("hi"));
  assert.ok(!svc.isSupported("xx"));
  assert.match(svc.languageName("hi"), /Hindi/);
  assert.ok(Object.keys(LANGUAGES).includes("ta"));
});
