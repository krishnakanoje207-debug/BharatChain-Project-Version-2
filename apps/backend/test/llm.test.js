"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { LlmService } = require("../dist/assistant/llm.service");

/** Fake ConfigService backed by a plain map. */
const cfg = (map) => ({ get: (k, d) => (k in map ? map[k] : d) });

test("no credentials → simulated provider", () => {
  const svc = new LlmService(cfg({}));
  assert.equal(svc.activeProvider, "simulated");
});

test("Groq key selected by default order", () => {
  const svc = new LlmService(cfg({ GROQ_API_KEY: "g" }));
  assert.equal(svc.activeProvider, "groq");
});

test("only Gemini key → gemini", () => {
  const svc = new LlmService(cfg({ GEMINI_API_KEY: "k" }));
  assert.equal(svc.activeProvider, "gemini");
});

test("only Ollama url → ollama", () => {
  const svc = new LlmService(cfg({ OLLAMA_URL: "http://localhost:11434" }));
  assert.equal(svc.activeProvider, "ollama");
});

test("LLM_PROVIDER preference is honoured when its credential exists", () => {
  const svc = new LlmService(cfg({ LLM_PROVIDER: "gemini", GROQ_API_KEY: "g", GEMINI_API_KEY: "k" }));
  assert.equal(svc.activeProvider, "gemini");
});

test("complete() returns null when no provider is configured (→ simulated fallback)", async () => {
  const svc = new LlmService(cfg({}));
  assert.equal(await svc.complete("sys", "user"), null);
});

test("ollama request uses OLLAMA_MODEL (default: bharatchain-assistant)", async (t) => {
  const bodies = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ response: "ok" }) };
  };
  t.after(() => { global.fetch = realFetch; });

  const dflt = new LlmService(cfg({ OLLAMA_URL: "http://localhost:11434" }));
  await dflt.complete("sys", "user");
  assert.equal(bodies[0].model, "bharatchain-assistant");

  const named = new LlmService(cfg({ OLLAMA_URL: "http://localhost:11434", OLLAMA_MODEL: "llama3.2:3b" }));
  await named.complete("sys", "user");
  assert.equal(bodies[1].model, "llama3.2:3b");
});
