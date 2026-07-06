"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseEther } = require("ethers");
const { AssistantService } = require("../dist/assistant/assistant.service");
const { ApplicationStatus } = require("@bharatchain/shared");

const SCHEMES = [
  { schemeId: 0, name: "PM-Kisan Samman Nidhi", category: "AGRICULTURE", active: true, installmentFormatted: "10000.0", description: "Income support for farmers." },
  { schemeId: 1, name: "Vidya Lakshmi Scholarship", category: "EDUCATION", active: true, installmentFormatted: "50000.0", description: "Scholarships." },
  { schemeId: 2, name: "PM Awas Yojana", category: "HOUSING", active: true, installmentFormatted: "50000.0", description: "Housing help." },
];

/** Build an AssistantService with in-memory mocks (LLM forced off → simulated path). */
function makeService({ apps = [], payments = [], notifications = [], entitlementWei = 0n, chainAddress = "0xabc" } = {}) {
  const repo = (rows) => ({ find: async () => rows, findOne: async () => rows[0] ?? null });
  const users = { findOne: async () => ({ id: "u1", fullName: "Test User", chainAddress }) };
  const chain = { paymentRouter: { entitlement: async () => entitlementWei } };
  const schemes = { listFromChain: async () => SCHEMES };
  const llm = { complete: async () => null, activeProvider: "simulated" };
  const bhashini = { translate: async (t) => t, languageName: () => "English" };
  return new AssistantService(users, repo(apps), repo(payments), repo(notifications), chain, schemes, llm, bhashini);
}

test("explains the platform from the knowledge base (about)", async () => {
  const r = await makeService().chat("u1", "What is BharatChain?");
  assert.equal(r.provider, "simulated");
  assert.match(r.answer, /blockchain-based welfare/i);
});

test("explains how payments work (KB, not the user's payment list)", async () => {
  const r = await makeService().chat("u1", "How does payment work?");
  assert.match(r.answer, /category-gated/i);
});

test("explains privacy/sovereignty", async () => {
  const r = await makeService().chat("u1", "Is my personal data safe?");
  assert.match(r.answer, /never goes on the blockchain/i);
});

test("cold-start: no applications", async () => {
  const r = await makeService().chat("u1", "What is the status of my applications?");
  assert.match(r.answer, /not applied to any scheme yet/i);
});

test("lists schemes a citizen can apply for", async () => {
  const r = await makeService().chat("u1", "Which schemes can I apply for?");
  assert.match(r.answer, /PM-Kisan Samman Nidhi/);
  assert.match(r.answer, /Vidya Lakshmi/);
});

test("grounded application status from the citizen's own data", async () => {
  const svc = makeService({ apps: [{ schemeId: 0, status: ApplicationStatus.APPROVED }] });
  const r = await svc.chat("u1", "What is the status of my applications?");
  assert.match(r.answer, /PM-Kisan Samman Nidhi: APPROVED/);
});

test("grounded balance uses the on-chain entitlement, not an invented number", async () => {
  const svc = makeService({
    apps: [{ schemeId: 0, status: ApplicationStatus.APPROVED }],
    entitlementWei: parseEther("6500"),
  });
  const r = await svc.chat("u1", "How much balance do I have?");
  assert.match(r.answer, /6500/);
});

test("rejection reason is surfaced", async () => {
  const svc = makeService({
    apps: [{ schemeId: 2, status: ApplicationStatus.REJECTED, rejectionReason: "Not eligible per records." }],
  });
  const r = await svc.chat("u1", "Why was my application rejected?");
  assert.match(r.answer, /Not eligible per records/);
});

test("language flag is echoed back", async () => {
  const r = await makeService().chat("u1", "What is e-rupee?", "hi");
  assert.equal(r.language, "hi");
  assert.equal(r.grounded, true);
});

test("suggestions are non-empty starter prompts", () => {
  const s = makeService().suggestions();
  assert.ok(Array.isArray(s) && s.length >= 3);
});

// ---------------------------------------------------------------- public mode

test("public: explains the platform from the knowledge base", async () => {
  const r = await makeService().publicChat("What is BharatChain?");
  assert.equal(r.provider, "simulated");
  assert.match(r.answer, /blockchain-based welfare/i);
});

test("public: lists the active schemes from the catalog", async () => {
  const r = await makeService().publicChat("Which schemes are open right now?");
  assert.match(r.answer, /PM-Kisan Samman Nidhi/);
  assert.match(r.answer, /Vidya Lakshmi/);
});

test("public: citizen registration walkthrough includes the signup link", async () => {
  const r = await makeService().publicChat("How do I register as a citizen?");
  assert.match(r.answer, /\(\/signup\)/);
  assert.match(r.answer, /OTP/i);
});

test("public: vendor onboarding gives the whole process with links", async () => {
  const r = await makeService().publicChat("How do I become an approved vendor?");
  assert.match(r.answer, /\(\/signup\)/);
  assert.match(r.answer, /Enrollment/i);
  assert.match(r.answer, /government/i);
});

test("answers never announce admin/RBI operator roles as user types", async () => {
  const r = await makeService().publicChat("Who can use BharatChain? What are the different types of users?");
  assert.doesNotMatch(r.answer, /four kinds/i);
  assert.doesNotMatch(r.answer, /admins? (create|approve|portal|sign)/i);
  assert.match(r.answer, /two kinds of accounts/i);
});

test("public: personal questions get a sign-in invitation, never data", async () => {
  const svc = makeService({ apps: [{ schemeId: 0, status: ApplicationStatus.APPROVED }] });
  const r = await svc.publicChat("What is the status of my applications?");
  assert.match(r.answer, /\(\/login\)/);
  assert.doesNotMatch(r.answer, /PM-Kisan Samman Nidhi: APPROVED/);
});

test("public: suggestions are visitor-oriented", () => {
  const s = makeService().publicSuggestions();
  assert.ok(s.length >= 3);
  assert.ok(s.some((x) => /vendor/i.test(x)));
  assert.ok(s.every((x) => !/my /i.test(x)));
});
