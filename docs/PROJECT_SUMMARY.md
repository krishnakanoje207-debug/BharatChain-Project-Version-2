# BharatChain — Complete Project Summary

> A single, end-to-end record of **what BharatChain is**, **how it was built**, the
> **tech stack**, the **implementation plan**, and the **verification** behind it.
> Companion docs: [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) (living plan),
> [`DEMO.md`](DEMO.md) (10-min walkthrough).

---

## 1. What it is

**BharatChain** is a blockchain-based **anti-corruption welfare-distribution system**.

Government welfare money flows **RBI → citizens → vendors → back to fiat**, but on-chain the
value only ever moves as a **transfer-restricted digital-rupee token (e₹)**, so **every hop is
transparent and auditable**. Eligibility is proven with **zero-knowledge proofs**; citizens and
vendors hold **no private keys** (a server-side relayer signs every transaction). No PII ever
touches the chain.

It was built **greenfield** as a **fully working prototype to present** (not slides), on a
**strict $0 budget** — only free / open-source / free-tier tooling, no paid APIs. The architecture
is production-shaped but sized to run on a laptop for a demo.

### The core flow

```
  Citizen signs up (phone + OTP + password, no wallet)
        │
        ▼
  Applies on the public site → eligibility checked against a FIXED 10,000-record govt registry
        │
        ▼
  Groth16 ZK proof of eligibility (identity-derived nullifier blocks double-dipping)
        │
        ▼
  Relayer enrolls on-chain → installment-based disbursal mints e₹ entitlement
        │
        ▼
  Citizen pays APPROVED, CATEGORY-ALLOWED vendors via a UPI-style token app
        │
        ▼
  Vendor delivery confirmed → vendor files redemption (ITR = KYC)
        │
        ▼
  RBI approves → on-chain burn + simulated NEFT payout to real fiat
        │
        ▼
  The Graph indexes a public, PII-free ledger · Kafka detects fraud anomalies
```

### Surface (one unified React app)

| App | Port | Audience | Purpose |
|---|---|---|---|
| `web` | 3000 | All (role-routed) | Unified National Welfare Portal — public home/schemes/ledger/about; citizen dashboard, apply (ZK), wallet+pay, history, notifications; vendor portal; admin (disbursement, anomalies, file redemptions, vendors); RBI (treasury, redemption approve/reject, disbursement); AI assistant (public info-desk for visitors + personal mode for signed-in citizens) |

---

## 2. Tech stack

Everything is free / OSS / free-tier.

| Layer | Technology |
|---|---|
| **Smart contracts** | Solidity, Hardhat, OpenZeppelin |
| **Chain** | Local Hardhat node (dev) + free L2 testnet (Polygon Amoy / Arbitrum Sepolia) story |
| **Zero-knowledge** | Circom 2.2.3 + snarkjs (Groth16), Poseidon Merkle tree (depth 16) |
| **Backend** | Node + NestJS, TypeORM (PostgreSQL), ioredis (Redis) |
| **Event pipeline** | Apache Kafka (KRaft mode) for anomaly/fraud detection |
| **Indexer** | The Graph (self-hosted Graph Node + IPFS) → public GraphQL ledger |
| **AI assistant** | Two surfaces: anonymous public info-desk (KB + scheme catalog only, IP rate-limited) and CITIZEN-gated personal RAG. Pluggable LLM (Groq / Gemini / Ollama via `OLLAMA_MODEL`) + Bhashini ULCA covering all 14 site languages; deterministic grounded responder as $0 fallback |
| **Frontends** | React + Vite (SPA), shared design system `@bharatchain/web-ui` |
| **Auth** | Phone + OTP (simulated SMS) + password; JWT + refresh rotation; Redis heartbeat sessions; lockout |
| **File storage** | MinIO (S3-compatible) for application documents |
| **Email** | Nodemailer (real, free Gmail SMTP) — best-effort |
| **Automation** | node-cron (local) + Chainlink Automation (testnet story) |
| **Infra** | Docker Compose — Postgres, Redis, Kafka, Graph Node + IPFS, MinIO |
| **CI/CD** | GitHub Actions (contract tests + backend suite + frontend builds gate every push) |
| **Tooling** | npm workspaces (monorepo) + npx, Node ≥ 20 (built on 24) |
| **Sovereign AI** | `ai-model/` side project — QLoRA fine-tune of an open base (Llama/Sarvam/AI4Bharat) for self-hosted, data-sovereign deployment (not wired into the site) |

### Hybrid integration policy (what's real vs simulated)

- **REAL:** email (Nodemailer), the entire on-chain rail, ZK proofs, Kafka, The Graph.
- **SIMULATED:** SMS/OTP (shown in-app/console/DB), bank payout (ledger entry + NEFT ref).

---

## 3. Monorepo layout

```
apps/
  backend/      NestJS API + relayer + event pipeline + AI assistant
  indexer/      The Graph subgraph (public welfare ledger)
  web/          Unified National Welfare Portal — one Vite+React app, role-routed   :3000
packages/
  contracts/    Solidity + Hardhat (10 contracts)
  circuits/     Circom + snarkjs ZK circuits
  registry/     Fixed 10,000-record government reference registry (committed fixture)
  shared/       Shared TypeScript types/enums
  web-ui/       Shared frontend design system + typed API client + AuthProvider
ai-model/       Self-hosted sovereign assistant model — dataset + LoRA pipeline (NOT wired in)
infra/          docker-compose.yml
scripts/        demo up/down + smoke / stress / on-chain-verification scripts
docs/           IMPLEMENTATION_PLAN · DECISIONS · DEMO · this summary
```

---

## 4. Smart contracts (10)

| Contract | Role |
|---|---|
| `RoleRegistry` / `RoleAware` / `Roles` | Role-based access control (separation of duties) |
| `DigitalRupee` | **Transfer-restricted ERC-20 e₹** — citizens may only pay category-allowed approved vendors; only vendors → redemption. Mint invariant: minted ≤ fund |
| `SchemeRegistry` | Schemes + per-scheme fund with **draw-down** accounting |
| `VendorRegistry` | Approved vendors + category allow-list |
| `BeneficiaryRegistry` | Enrolled beneficiaries |
| `DisbursementController` | **Pull-based** Merkle-claim disbursal (no on-chain loop) with variable per-citizen amounts |
| `PaymentRouter` | Citizen → vendor entitlement payments |
| `RedemptionController` | Vendor redemption → consume + burn |
| `Verifier` + `ZKEnroller` | Groth16 verifier + enroll-with-proof entrypoint |

**Hardening baked in:** pull-based disbursal (no gas-bomb loops), proof-of-delivery gates
redemption, identity-derived in-circuit nullifier (PAN + schemeId), role separation, no PII
on-chain (only commitments).

---

## 5. Zero-knowledge layer

- `eligibility.circom` — Poseidon Merkle proof (depth 16) against the fixed 10k registry root
  + farmer / unknown-doc eligibility predicate + nullifier.
- Committed registry root:
  `10093031644768308786192335454823296287178094785506788504260158440690735194452`
- Registry composition: **4019 farmer / 3474 non-farmer / 2507 unknown** (1531 with docs).
- Flow: backend matches PAN against the registry → builds witness → snarkjs Groth16 proof →
  relayer calls `enrollWithProof`. Farmers + unknown-with-docs are **APPROVED & on-chain**;
  non-farmers **REJECTED**.
- The **nullifier is identity-derived**, so the same PAN can't re-enroll the same scheme
  (anti-double-dip), enforced in-circuit.

---

## 6. Implementation plan & what was built (phase by phase)

All 9 phases are **complete**; the prototype is feature-complete and verified live.

### Phase 0 — Foundation
npm-workspaces monorepo, `infra/docker-compose.yml` (Postgres / Redis / Kafka-KRaft /
IPFS + Graph-Node / MinIO), GitHub Actions CI, NestJS `/health`.

### Phase 1 — Contracts
8 → 10 Solidity contracts (see §4). `deploy.ts` wires roles and **bundles ABIs + addresses**
into `deployments/<network>.json` (consumed by backend + indexer).

### Phase 2 — Zero-knowledge
`eligibility.circom`, generated `Verifier.sol`, `ZKEnroller.sol`. 10 contracts total,
**6 Hardhat tests pass** including a real proof.

### Phase 3 — Registry + Backend intake
- `@bharatchain/registry`: committed **fixed 10k registry** (never randomized) + root.
- NestJS backend: config (TypeORM + ioredis, global ValidationPipe, `/api` prefix); entities
  (users, applications, application_documents, scheme_cache, vendors, audit_logs).
- **Auth:** phone + password signup → simulated-SMS OTP → verify assigns a keyless deterministic
  `chainAddress`; login with lockout-aware errors; refresh rotation; forgot/reset; JwtAuthGuard
  checks a Redis heartbeat session (auto-logout); OTP rate-limited.
- **ChainService:** relayer-signed contracts loaded from the deployment bundle.
- **Schemes:** public browse-by-category (search/filter).
- **Application intake:** PAN match vs registry → docs to MinIO auto-verify → Groth16 proof via
  snarkjs → relayer `enrollWithProof`.
- **Seeder** (`npm run seed`): idempotent — 3 demo schemes + registry root + 8 demo
  institutions/vendors + scheme metadata + a demo **admin** user.

### Phase 4 — Disbursal
- `DisbursementService.runRound(schemeId)` builds an OZ `StandardMerkleTree` of
  (citizen, amount) over a scheme's APPROVED beneficiaries, opens an on-chain installment
  (`createInstallment` draws the fund down, remaining-fund guard), then relayer-claims each →
  `PaymentRouter` entitlement.
- Admin/RBI-only `POST/GET /disbursement/rounds` via `@Roles` + `RolesGuard`.
- **Notifications** (`NotificationService`, best-effort email else simulated) on enroll + each claim.
- Citizen `/me` surface: `/me/entitlements`, `/me/notifications`, mark-read.
- **Cron** (`DisbursementCron`, node-cron, non-overlapping) auto-disburses undisbursed
  beneficiaries; `USE_CHAINLINK_AUTOMATION=true` stands the local cron down.
- Over-disbursal guard via `Application.disbursementCount`.

### Phase 5 — Payments (full e₹ rail)
- **Vendors module:** `GET /vendors?schemeId=` — approved vendors a citizen may pay (same
  category gate as the contract).
- **Payments module:** citizen `POST /payments` (relayer pays an allowed vendor from the
  entitlement), `POST /payments/:id/confirm` → DELIVERED/redeemable, `GET /payments`.
- **Redemption module:** ADMIN/RBI file redemption with ITR/legitimacy capture; RBI approve →
  on-chain consume + burn + simulated NEFT ref; reject; list/detail.
- **Critical robustness fix:** `ChainService.runExclusive()` serializes **all** relayer txs
  (mutex + managed nonce + resync) — fixes nonce collisions between cron / disbursal / payments /
  redemption sharing the single relayer.

### Phase 6 — The Graph + Kafka anomaly detection
- **Subgraph** (`apps/indexer`): public read layer (no PII) — Scheme / Vendor / Enrollment /
  Installment / Claim / Payment / Redemption + a singleton Stat; indexes 6 contracts.
  Query at `http://localhost:8000/subgraphs/name/bharatchain/welfare`.
- **Kafka anomaly** (backend): best-effort `KafkaService` (KRaft, pre-creates topic, no-op if
  broker down); PaymentsService emits `payment.paid`; `AnomalyService` detects
  **FAN_IN / VELOCITY / SELF_DEAL** → `Anomaly` table + admin/RBI notify; admin-only
  `GET /anomalies` + resolve.

### Phase 7 — AI assistant (reworked 2026-07-05)
- **Two surfaces.** Personal: `POST /assistant/chat` (JWT + **CITIZEN role gate**) does **RAG over
  the citizen's OWN data** (applications + statuses, on-chain entitlements, recent payments,
  notifications, active-scheme catalog). Public: `POST /assistant/public/chat` (anonymous,
  IP rate-limited 20/5 min) answers ONLY from the platform knowledge base + public scheme catalog —
  zero personal data is even loaded on that path; personal questions get a sign-in invitation.
- Answers via `LlmService` (pluggable Groq/Gemini/Ollama; Ollama model set by `OLLAMA_MODEL`,
  default `bharatchain-assistant`; returns null → deterministic grounded responder so $0/no-keys
  works) → multilingual via `BhashiniService` (**all 14 website languages**).
- Knowledge base (`knowledge.ts`) explains the platform + full **citizen registration** and
  **vendor onboarding** walkthroughs with markdown links the widget renders as SPA navigation.
- **No hallucinated figures** — everything comes from retrieved data. The assistant context is a
  whitelist: no phone/PAN/document IDs/chain address ever reach the model.
- **Operator-role secrecy:** admin/RBI are never described as user roles, portals or sign-in
  options — public account types are CITIZEN and VENDOR only; administration/oversight is described
  institutionally. Enforced in prompts + KB + training data, with a regression test.

### Phase 8 — Frontends
- 4 React + Vite apps (see §1 table) + shared **`packages/web-ui`** (`@bc/ui` path alias) —
  theme.css design system, typed API client, AuthProvider + heartbeat, PortalLayout/Login,
  reusable admin/RBI panels — **built only around real endpoints, no fake buttons**.
- Design from captured india.gov.in direction: navy / saffron `#FF9933` / maroon `#C8102E`,
  Ashoka emblem, accessibility strip (font-size, high-contrast, language).
- **Live counters:** `usePoll(fn, ms)` re-fetches balances / disbursed totals / rounds /
  anomalies every ~5–6s so values tick up as the backend increments.

### Phase 9 — CI/CD, testnet, demo, docs
- CI (`.github/workflows/ci.yml`): contracts job (circom + zk:build + compile + contract tests) +
  app job (backend suite + 4 frontend builds + lint).
- Testnet `deploy:amoy` / `deploy:arbitrum` scripts (need a funded faucet key for a real deploy).
- **One-command demo:** `scripts/demo-up.ps1` / `demo-down.ps1` + `docs/DEMO.md` walkthrough.

---

## 7. Key engineering refinements (post-phase hardening)

These were real bugs found via adversarial testing and fixed:

1. **Relayer nonce serialization** — all runtime relayer writes (enroll, disburse, pay, redeem)
   now route through `runExclusive` with a managed nonce. Holds under **12 concurrent enrolments
   (12/12, 0 errors)** and **23/23 claims in one round**.
2. **Re-application bug** — REJECTED applicants can now retry; PENDING/APPROVED still block;
   nullifier still blocks double-enroll.
3. **Installment-aware disbursal** — manual rounds used to re-pay *every* approved beneficiary
   each run (double-pay). Now each scheme tracks `installmentNo`; a round pays only beneficiaries
   whose `disbursementCount < installmentNo` (so late enrollees catch up, nobody is paid twice).
4. **Late-enrollee under-payment fix** — a catch-up round pays the **full gap**
   `(installmentNo − disbursementCount) × amount` (variable Merkle amounts), so late joiners reach
   the same cumulative total in one round.
5. **Per-beneficiary cap** — new per-scheme `maxInstallments` (default 3) caps total entitlement
   (`maxInstallments × installment`); a round where everyone is at the cap is rejected 400.
6. **Kafka rolling-window timezone fix** — window query uses DB-side
   `(now() at time zone 'UTC') - make_interval(...)` because `createdAt` is naive-UTC.

---

## 8. Verification & testing

- **Contract tests:** 6 Hardhat tests (incl. a real ZK proof).
- **Backend unit suite:** **100 tests, all green**, run via `node:test` against compiled `dist/`
  (zero new deps — no jest), hand-rolled mocks, no infra needed (`npm test -w @bharatchain/backend`).
- **Smoke / stress / verification scripts** (`scripts/`):
  - `final-smoke.ps1` (15), `loophole-probe.ps1` (28), `loophole-probe2.ps1` (11) — adversarial probes
  - `phase5-smoke` / `phase6-anomaly-smoke` / `phase7-assistant-smoke` — per-phase E2E
  - `provision-stress.ps1` — 12 concurrent enrolments, 0 failures
  - `installment-test.ps1` (11), `scale-5-cohorts.ps1` (24), `scale-100-installments.ps1`
  - `onchain-verify.mjs` (12) — drives a real enroll→disburse→pay→confirm, then reads the chain
    **directly with ethers**: every tx receipt `status=1`, on-chain entitlement moves by exactly the
    expected amount, **backend API view == direct on-chain read**, invariant disbursed ≤ fund holds.
- **Scale proof:** 112 citizens × 3 installment rounds — **0 failures across 324 on-chain claims**;
  early cohort hit exactly 30,000 e₹ each, late joiners caught up correctly, nobody over the cap.

---

## 9. How to run (local demo)

```bash
npm install
cp .env.example .env          # everything defaults to free/local

# One command: infra → chain → deploy → seed → backend
powershell -ExecutionPolicy Bypass -File scripts/demo-up.ps1

# then the unified portal:
npm run dev -w @bharatchain/web
```

Manual order: `npm run infra:up` → `npm run node -w @bharatchain/contracts` (separate shell) →
`npm run deploy:local -w @bharatchain/contracts` → `npm run seed -w @bharatchain/backend` →
`npm run backend:dev`. Backend on **:3001**, routes under `/api`.

**Demo logins:** ADMIN `9000000000` / `admin12345`. Eligible PANs: `LJAAN1880Y`, `LEFSK8542C`,
`JSQUP2551W`, `WMRTS2648Z`; non-farmer `DYCNH0035D` is rejected. (See `docs/DEMO.md`.)

> ⚠️ Re-running scale/installment tests needs a clean counter: redeploy:local + DROP SCHEMA +
> reseed + restart backend (so ChainService loads the new addresses), since each run leaves the
> scheme at a higher installment level.

---

## 10. Data sovereignty (AI)

The assistant runs fully locally with a deterministic grounded responder at **$0**, and drops in a
real model the moment a key is set (`LLM_PROVIDER` / `GROQ_API_KEY` / Ollama). For a national
deployment, the `ai-model/` side project (deliberately **outside** the npm workspaces and **not
wired into the website**) fine-tunes a **self-hosted** open base so model **and** data stay on
national infrastructure:
- Path A — Ollama `Modelfile` (no GPU): `ollama create bharatchain-assistant -f ai-model/Modelfile`
  — the backend picks it up via `OLLAMA_MODEL` (defaults to `bharatchain-assistant`), zero code changes.
- Path B — `scripts/build_dataset.py` → `data/bharatchain-instruct.jsonl` (177 examples incl.
  visitor-mode, no PII) → `train/train_lora.py` (QLoRA, free Colab/Kaggle GPU) → `train/export_gguf.md`.

---

## 11. Status & known gaps

- **All 9 phases complete; prototype feature-complete and verified.**
- **Frontend:** fully rebuilt from scratch as a single unified `apps/web` (Vite + React + TS) on the
  approved `design-system` ("modern gov-tech") tokens — one role-routed app covering public, citizen,
  vendor, admin and RBI. The old 4 apps + `@bc/ui` were removed. Backend/auth/API/endpoints unchanged.
- **Seeder:** both an ADMIN (`9000000000`/`admin12345`) and an RBI_ADMIN (`9000000001`/`rbiadmin12345`)
  are seeded; override via `ADMIN_PHONE`/`ADMIN_PASSWORD` and `RBI_PHONE`/`RBI_PASSWORD`.
- **Optional polish (non-blocking):** real testnet deploy; wire the public-ledger page to The Graph
  (currently a live transparency view over the public schemes API); admin backend endpoints for
  create-scheme / approve-vendor / list-all-applications (currently seeder/on-chain only).

> Prototype — no real funds, simulated SMS / bank payout, no PII on-chain.
```