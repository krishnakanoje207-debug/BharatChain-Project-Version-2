# BharatChain — Implementation Plan

> **Status:** Phase 2 complete — ZK eligibility circuit + verifier-gated enrollment, real proofs verified on-chain (10 contracts, 6 tests pass, 2026-06-21). Greenfield.
> **Last updated:** 2026-06-21 (Phase 2 built)
> **Frontend:** design direction received (§8); framework still undecided.

BharatChain is a blockchain-based anti-corruption welfare-distribution system. Government welfare
funds flow **RBI → citizens → vendors → back to fiat**, but on-chain the value only ever moves as a
**digital-rupee token**, making every hop transparent and auditable.

---

## 0. Guiding constraints

- **$0 cost.** Every dependency is OSS or perpetual-free-tier. No paid APIs, no card required.
- **Production architecture, demo scale.** Build everything for real (incl. Kafka, The Graph, L2,
  Bhashini AI) but size it for a laptop demo, not a 200M-user load test.
- **Keyless for users.** No seed phrases/wallets. A server-side **relayer** holds the one operational
  signer; users authenticate with phone + OTP + password, and prove eligibility with **zero-knowledge
  proofs**.
- **Frontend deferred.** Page/role structure is defined; framework wait on go-ahead. Visual direction in §8.

## 1. Free tech-stack map

- **Smart contracts:** Solidity + Hardhat + OpenZeppelin. Local: Hardhat Network. Testnet: **Polygon
  Amoy** or **Arbitrum Sepolia** (free faucets; also the "L2 rollup" story).
- **Zero-knowledge:** **Circom + snarkjs** (Groth16).
- **Automation:** **Chainlink Automation** on testnet (free, faucet LINK) + **node-cron** fallback locally.
- **Backend:** Node.js + **NestJS** (or Express) + ethers.js. **PostgreSQL** + **Redis**.
- **Event pipeline:** **Apache Kafka** (KRaft, no Zookeeper) or **Redpanda Community** — event bus / ETL
  into Postgres + notifications + anomaly detection, replacing naive polling.
- **Indexer:** **The Graph** self-hosted Graph Node (Docker) → GraphQL for the public ledger & analytics.
- **Document storage:** **MinIO** (S3-compatible) or local **IPFS**.
- **AI assistant:** **Bhashini ULCA** (free ASR/translate/TTS) + free LLM (**Gemini** or **Groq** free
  tier; **Ollama** local fallback).
- **Email:** Nodemailer + Gmail SMTP (free). **SMS/OTP:** simulated. **Bank payout:** simulated ledger.
- **Infra/DevOps:** **Docker Compose** (local stack) + **GitHub Actions** (CI/CD, contract tests gate
  deploys). Optional public frontend URL via **Vercel** free tier.
- **Monorepo tooling:** **npm workspaces + npx** (pnpm only as fallback if npm blocks the monorepo).

## 2. Architecture & token flow

```
Citizen/Vendor ──auth(phone+OTP)──▶ API (NestJS) ──▶ Relayer ──▶ Smart Contracts (EVM)
        │                              │                              │ events
   AI assistant                  Postgres/Redis                       ▼
 (Bhashini+LLM)                  MinIO/IPFS          The Graph  +  Kafka ──▶ ETL ──▶ Postgres ledgers
                                                          │                       ├▶ Notifications (email real / SMS sim)
                                                     Public ledger UI             └▶ Fraud/anomaly detection
```

Flow: **apply → eligibility (ZK match vs the fixed government reference registry) → enroll on-chain →
Chainlink trigger draws down the fund and allocates tokens → citizen pays approved, category-allowed
vendor → citizen confirms delivery → vendor redeems delivered payments → RBI legitimacy/ITR check →
simulated fiat payout.**

## 3. Data model — two separate stores (IMPORTANT)

1. **Government citizen reference registry** — the "official government data" eligibility is checked
   against. **10,000+ FIXED, hardcoded, deterministic records** committed as a fixture and always loaded
   identically. **Never randomized at runtime** (this caused major bugs in the earlier version). Real
   citizens supplied by the user are appended here on request. Includes a Merkle tree whose root is
   committed on-chain for ZK proofs.
2. **User accounts** — **empty at start; created on signup** (phone + OTP). A citizen's signup +
   application is matched against store #1 for eligibility. Vendors and admins are also accounts here.
3. **Verification is by document unique IDs.** Each registry record stores the **unique IDs of the
   citizen's documents** (PAN no., Kissan-card no., land-record ID, …). An application is verified by
   matching those IDs against the registry — no DigiLocker/Aadhaar needed for the prototype. The canonical
   ID (PAN) also seeds the ZK nullifier (§5). The fixture carries each scheme's **predicate fields**
   (profession, student status, income, housing/landless) so all 3 schemes evaluate against the same data.

**Scheme funds are per-scheme configurable** (they differ per scheme; ₹10,000 cr was only the
agriculture example). Each scheme also defines a **category/sector** and a **per-beneficiary installment
amount** (§4).

**Demo defaults (plausible — used unless overridden by admin):**

| Scheme | Category | Fund (demo) | Per beneficiary / installment | Installments | Total / beneficiary | Pays category |
|---|---|---|---|---|---|---|
| Kisan Agriculture Welfare | Agriculture | ₹10,000 cr | ₹10,000 | 3 | ₹30,000 | `AGRI_INPUT` |
| Vidya Student Scholarship | Education | ₹5,000 cr | ₹50,000 | 2 | ₹1,00,000 | `EDU_INSTITUTION`, `TECH_STORE` |
| Awas Housing Yojana | Housing | ₹8,000 cr | ₹50,000 | 3 | ₹1,50,000 | `HOUSING_MATERIAL` |

## 4. Smart contracts

1. **DigitalRupee** (restricted ERC-20, "e₹", 1 token = ₹1) — **transfer-restricted**: citizens can move
   tokens ONLY via `PaymentRouter` to an approved, category-allowed vendor; only vendors can move them
   into `RedemptionController`. No free peer-to-peer transfers. Mint by `TREASURY` (capped — see §4.9),
   burn on redemption.
2. **SchemeRegistry** — per-scheme metadata: name, **category/sector** (Agriculture, Education, Housing,
   …), type, **own total fund**, **per-beneficiary installment amount**, number of installments,
   **allowed vendor categories**, status. Admin creates schemes and assigns the category.
3. **BeneficiaryRegistry** — per-scheme set of approved **citizen commitments / nullifiers**, never raw PII.
4. **VendorRegistry** — admin-approved vendors + **category** (`AGRI_INPUT`, `EDU_INSTITUTION`,
   `TECH_STORE`, `HOUSING_MATERIAL`, …). Regular vendors self-register + admin-approve. (Exception: a few
   dummy **institutions** are pre-seeded for the scholarship/Aavas demos — see §10.) Gates payments.
5. **DisbursementController** — **pull-based** disbursal: each installment publishes a **Merkle root of
   allocations** (or relayer-batched credits) — no unbounded on-chain loop. **Draws down the scheme fund
   and stops/queues remaining beneficiaries when the installment fund is exhausted.**
   **Chainlink-Automation-triggered** at the RBI-set date/time; emits public `LogTransaction` events.
6. **PaymentRouter** — citizen→vendor transfers; enforces vendor approved **and** category allowed for the
   funding scheme (earmarked balances: `citizen ⇒ scheme ⇒ balance`). Unverified/forbidden vendor →
   payment fails. Exposes a **delivery-confirmation** hook (§6); writes only **commitments/hashes**
   on-chain (sensitive detail off-chain).
7. **RedemptionController** — vendor redeem request → **gated on delivered (citizen-confirmed) payments**
   → RBI approval (ITR used as a vendor-legitimacy/KYC check, **NOT** as delivery proof) → burn + emit;
   off-chain simulated bank payout.
8. **ZKVerifier** — snarkjs-generated Groth16 verifier.
9. **Roles & invariants** — OZ AccessControl: `ADMIN`, `RBI_ADMIN`, `RELAYER`, `TREASURY` (separated;
   privileged ops multi-sig). Enforced invariants: `minted(scheme) ≤ fund(scheme)` and
   `redeemed ≤ delivered ≤ minted`. **No PII on-chain** — only commitments/nullifiers.

## 5. Zero-knowledge design

**Eligibility circuit (Circom):** proves *"I know a record in the government reference registry
(Merkle-inclusion under an on-chain-committed root) whose **document unique IDs** match my application AND
it satisfies the scheme's eligibility predicate"*, and outputs
**`nullifier = hash(canonicalDocId, schemeId)`** computed **inside the circuit from the matched record's
canonical ID (PAN)** — NOT from a user-chosen secret — so the same person always yields the same nullifier
per scheme. On-chain verification records the nullifier → privacy + eligibility match +
one-claim-per-identity-per-scheme.

**Re-apply policy:** the nullifier is **consumed only on acceptance**. A *rejected* applicant can fix
documents and retry (incl. an unknown-profession reject becoming eligible via the Kissan-card fallback);
a *pending* application cannot be duplicated.

**Eligibility predicate with unknown professions** (CONFIRMED):
- known **non-farmer** → reject ("this scheme is only valid for farmers");
- **farmer** → eligible;
- **unknown/unregistered** → document-proof fallback (valid Kissan card + land-record match) in-circuit.

> **Identity binding (accepted tradeoff):** we deliberately do NOT require the signup phone to match the
> registry record's phone — it would burden low-literacy users. Verification rests on document-unique-ID
> match + the identity-derived nullifier. Residual impersonation risk is knowingly accepted for the prototype.

## 6. Backend, event pipeline & data

- **Auth:** phone+OTP signup/login, optional email, **forget-password**, JWT+refresh in Redis.
  **Invalid credentials → inline error + rate-limit + lockout after N attempts** (not a page refresh).
  **Auto-logout via session heartbeat** (server invalidates ~60s after heartbeats stop) — tuned for mobile
  backgrounding so users aren't logged out mid-task, paired with a normal idle timeout.
- **Application intake:** pick scheme first → upload docs (→ MinIO/IPFS) → match document unique IDs +
  build Merkle proof → ZK prove → relayer enrolls. Reapply-block via nullifier (consumed on acceptance).
- **Proof-of-delivery:** a citizen→vendor payment is marked **delivered** only when the citizen
  **confirms receipt** in the token app (OTP/confirm) and/or a GST e-invoice/receipt is attached.
  **Redemption draws only from delivered payments.** ITR is a vendor-legitimacy/KYC check.
- **Kafka vs The Graph:** **The Graph** = authoritative query/index layer for the public ledger UI;
  **Kafka** = event bus for ETL→Postgres, notifications, and **fraud/anomaly detection** (one vendor
  receiving from abnormally many citizens, circular flows, velocity spikes).
- **Notifications:** Kafka consumer → real **email** + simulated **SMS** + in-app (disbursal alerts,
  **rejection notices**, delivery confirmations).
- **Private ledgers stay off-chain:** citizen→vendor and RBI→vendor detail lives in access-controlled
  Postgres; only **commitments/hashes** go on-chain. The public RBI→citizen ledger is shown on the website.
- **DB highlights:** `users`, `govt_citizen_registry` (fixed 10,000+, with document-ID fields), `schemes`,
  `applications` (status, reapply-block), `vendors` (category, agri-degree doc, ITR submission),
  `beneficiary_enrollments`, `payments` (+ delivery status), `ledger_disbursements` (public),
  `ledger_payments`/`ledger_redemptions` (private), `automation_triggers`, `notifications`, `documents`,
  `audit_log`. The **"application status not updating in admin panel"** bug is designed out via a single
  source of truth + Graph/Kafka-driven refresh.

## 7. AI assistant

Bhashini (ASR→translate→LLM→translate→TTS) + free LLM, **RAG over the citizen's own scheme/eligibility/
allocation data**, multilingual voice + chat (Hindi/Tamil/Bengali/…), embedded in the citizen app.

## 8. Frontends — structure only (framework TBD)

**Design direction (refs provided 2026-06-21 — `india.gov.in` + `Screenshot 2026-06-21 110039.png`):**
government-portal look — deep navy/government-blue hero with monument backdrop, saffron (#FF9933) +
red/maroon (#C8102E) accent buttons, white card surfaces, Ashoka emblem + "Satyameva Jayate", prominent
centered search, trending chips, stats-card row, formal footer; accessibility controls (skip-to-content,
font-size +/–, language switch, high-contrast). Framework still undecided.

1. **Public website** — home (india.gov.in-style hero + search); a **"Government Schemes" browse page**:
   an option that, when clicked, lists **all active schemes grouped by category/sector** (Agriculture /
   Education / Housing / …) as cards, with search + category filter (mirrors the india.gov.in
   "Govt. Schemes" pattern); public benefit-count ledger; citizen signup/login + dashboard (profile,
   application status, notifications); apply-flow (pick scheme first; no re-apply if accepted); vendor
   signup + govt-approval application; AI assistant widget.
2. **Token app (UPI-style)** — citizen wallet (balance per scheme), pay-vendor (verify-before-pay,
   fail/warn if unverified), **confirm-delivery**, history; vendor redemption requests + status.
3. **Admin portal** (separate origin) — approve/reject vendors, **"Vendors" section** (current + pending),
   view/update citizen applications, **add new schemes**.
4. **RBI portal** (separate origin) — approve ITR/legitimacy + trigger simulated payout, manage disbursal
   **triggers (date/time only)**, treasury overview.

Cross-cutting behaviors: phone+OTP, forget-password, heartbeat auto-logout, error+lockout on bad creds,
rejection notifications.

## 9. DevOps / CI-CD / L2

- **Docker Compose:** Postgres, Redis, Kafka, Graph Node + IPFS, MinIO, Hardhat node, backend.
- **GitHub Actions:** lint + Hardhat contract tests + backend tests gating deploy; documented
  zero-downtime/rolling deploy.
- **L2:** deploy to a free L2 testnet (Arbitrum Sepolia / Polygon Amoy); optional local Orbit/CDK devnet
  (free but heavy) to show a "sovereign appchain."

## 10. Seed / reference data

- **Government reference registry: 10,000+ FIXED records** (deterministic fixture, never re-randomized).
  Indian names, **valid-format document unique IDs** (PAN no., Kissan-card no., land-record ID), income,
  per-scheme predicate fields (profession, student status, housing/landless), phone, optional email.
- **Professions diversified, including unknown/unregistered** (drives eligibility + demoes
  approve/reject/fallback). Mix of registered farmers, registered non-farmers, and unknown-profession citizens.
- **Real citizens** provided by the user are appended on request.
- **Regular vendors: none pre-seeded** — they self-register and are admin-approved; ITR submitted at
  redemption and RBI-reviewed.
- **Exception — a few dummy institutions ARE seeded** as approved vendors (plausible, fictional) so the
  non-agriculture schemes are demoable:
  - *Education (scholarship)* — institutions: **Bharat Institute of Technology, Indore**; **Saraswati
    National University, Bhopal**. Tech stores: **DigiBharat Tech Store, Jaipur**; **Sharma Electronics &
    Computers, Nagpur**.
  - *Housing (Aavas)* — material suppliers: **Shakti Cement & Building Materials, Raipur**; **Ambika Steel
    & Hardware Suppliers, Kanpur**.

## 11. Phased roadmap

0. ✅ Monorepo scaffold + Docker Compose + CI skeleton — done & verified (2026-06-21)
1. ✅ Contracts + tests (local) — restricted token, registries, controllers, invariants, pull-based disbursal — done & verified (2026-06-21)
2. ✅ ZK circuit + Merkle infra + verifier-gated enroll (document-ID match + identity nullifier) — done & verified (2026-06-21); fixed 10k govt registry fixture lands with backend seeding (Phase 3)
3. ✅ Backend auth (hardened) + intake + enrollment — done & verified (2026-06-21)
4. ✅ Disbursal (Chainlink + cron, fund-drawdown) + notifications — done & verified (2026-06-21)
5. ✅ Payments (category-gated) + proof-of-delivery + redemption + RBI/ITR + simulated payout — done & verified (2026-06-21)
6. ✅ The Graph + Kafka ETL + public ledger + anomaly detection — done & verified (2026-06-21)
7. ✅ AI assistant — RAG over citizen data, multilingual (Bhashini + free LLM, simulated fallback) — done & verified (2026-06-21)
8. ✅ Wire the 4 frontends (india.gov.in design language) — public/token/admin/RBI + shared @bc/ui, done & verified (2026-06-22)
9. ✅ CI/CD (contract+ZK+backend tests + 4 frontend builds), testnet deploy scripts, one-command demo runbook + DEMO.md, README — done (2026-06-22); actual testnet deploy needs a funded faucet key

## 12. Open items / standby

- **Crop-buyer vendor** (agriculture vendor type 2): **DROPPED for now** (2026-06-21) — may be added later if needed.
- **No token expiry/clawback** — decided to keep as is (2026-06-21).
- **Design-review fixes folded in** (2026-06-21): proof-of-delivery, transfer-restricted token,
  identity-derived nullifier, pull-based fund-drawdown disbursal, off-chain private ledgers, mint
  invariants, key-separation + rate limiting, anomaly detection, auth hardening, re-apply policy,
  document-ID verification, dummy institutions. (Identity-phone-binding intentionally NOT adopted.)
- **Pinned (2026-06-21):** per-beneficiary installment amounts + demo scheme funds (§3); dummy institutions
  to seed (§10); a categorised **"Government Schemes" browse page** added to the public site (§8).
- **Frontend:** design direction captured (§8); framework still TBD.
- **Implementation: ON HOLD** — no code until explicit go-ahead.

## 13. Security hardening (cross-cutting)

- **Key management:** separate `ADMIN` / `RBI_ADMIN` / `RELAYER` / `TREASURY`; **multi-sig** the
  privileged ops (mint, scheme creation, large disbursals); keys in a KMS/secret store; on-chain
  amount/rate caps. The relayer is the central trust assumption — documented and minimized.
- **Rate limiting** (app-wide): login attempts, OTP requests/resends, application submissions, and
  payments — to blunt brute-force, OTP abuse, and spam.
- **Anomaly/fraud detection:** Kafka-fed monitors for suspicious vendor/citizen patterns (fan-in,
  circular flows, velocity), surfaced to admin/RBI dashboards.
- **Audit log:** immutable record of admin/RBI actions (vendor approvals, redemption approvals, trigger edits).
- **No PII on-chain:** only commitments/nullifiers; sensitive detail off-chain in Postgres.
- **Prototype caveats:** simulated OTP means phone "verification" isn't a real control yet; document
  authenticity rests on unique-ID match (no DigiLocker/Aadhaar in the free prototype).
