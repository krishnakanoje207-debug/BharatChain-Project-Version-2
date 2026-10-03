# BharatChain — Demo Walkthrough

A 10-minute end-to-end demo of the full welfare lifecycle:
**apply → ZK eligibility → vendor onboarding → disburse → pay vendor → confirm delivery → vendor
redemption → RBI approval**, plus the fraud monitor and the AI assistant.

## 0. Bring it up

```powershell
powershell -ExecutionPolicy Bypass -File scripts\demo-up.ps1
```

This starts infra (Postgres/Redis/Kafka/Graph/MinIO), a Hardhat node, deploys + seeds, and starts the
backend at `http://localhost:3001/api`. Then start the unified portal:

```bash
npm run dev -w @bharatchain/web          # everything on :3000
```

All surfaces live in one app and are **role-routed on login**: citizens land on `/citizen`, admins on
`/admin`, RBI on `/rbi`, vendors on `/vendor`. The public site (`/`, `/schemes`, `/ledger`, `/about`) needs
no login.

> **Demo logins (both seeded, local dev defaults).** Admin: **9000000000 / admin12345** (role `ADMIN`).
> RBI: **9000000001 / rbiadmin12345** (role `RBI_ADMIN`). Override via `ADMIN_PHONE`/`ADMIN_PASSWORD` and
> `RBI_PHONE`/`RBI_PASSWORD`. The hosted deployment uses different, strong passwords (not in the repo).

> **Eligible farmer PANs for PM-Kisan** (from the fixed government registry): `LJAAN1880Y`, `LEFSK8542C`,
> `JSQUP2551W`, `WMRTS2648Z`. Each PAN can enrol a scheme only once (the ZK nullifier prevents
> double-dipping), so use a fresh PAN per new citizen. A non-farmer PAN (e.g. `DYCNH0035D`) will be
> **rejected** — good to show. Eligibility is per scheme: these farmer PANs do not qualify for the
> scholarship or PM Awas; for those, pick a registry record matching the filters in
> `scripts/per-scheme-predicate.mjs`.

## 1. Public site (`:3000`) — discover + apply

1. **Home** — government-portal hero, search, live stats, and "Government Schemes" grouped by sector.
2. **Sign up** (phone + password → simulated OTP, shown on screen) → land on the **Dashboard**.
3. **Apply** → pick **PM-Kisan Samman Nidhi** → enter PAN `LJAAN1880Y` → *Verify & submit*.
   A zero-knowledge proof is generated and the relayer enrols you on-chain → **APPROVED**.
   (Try a non-farmer PAN to show a **REJECTED** result — the proof fails, no PII revealed.)
   The form is scheme-specific: **Agriculture** asks for the Kisan card + land record, **Education**
   for caste category + student status, **Housing** for housing status. These declarations are optional
   but must match the registry record if given; the proof checks that scheme's own predicate.
4. Open the **💬 assistant** (bottom-right — it's there even **before signing in**):
   - Logged **out** (public info desk): ask *"What is BharatChain?"*, *"How do I become an approved
     vendor?"* (full onboarding walkthrough with signup links), or *"Which schemes are open right
     now?"*. Ask *"What is my balance?"* to show it refuses personal questions and invites sign-in.
   - Logged **in** as a citizen: ask *"What is my application status?"*, *"How much balance do I
     have?"* — grounded in your own data, in any of the 14 site languages.

## 2. Vendor onboarding (`/vendor` → `/admin`) + disburse

1. In a separate browser/profile, **Sign up** choosing the **Vendor** account type → you land on the
   vendor portal.
2. **Enrollment** → declare a business from the fixed government business registry that isn't already
   claimed, e.g. *Green Field Agro Centre* / `09UNVZA2825Z6ZP` (agri inputs, valid licence) → the
   application is **PENDING**.
3. Login as admin **9000000000 / admin12345** → **Vendors** → **Approve** the application. The relayer
   registers the vendor on-chain (`approveVendor`) and ZK-enrols it into every scheme its category
   serves (a real vendor proof per scheme). (A lapsed-licence business is rejected.)
4. **Disbursement** → **Run round** on PM-Kisan → every enrolled citizen is credited ₹10,000 e₹
   (the scheme fund draws down). The **Overview** tab shows outlay vs disbursed.

## 3. Citizen wallet (`/citizen`) — pay + confirm delivery

1. Login as the citizen → **Wallet** shows the ₹10,000 e₹ balance.
2. **Pay a vendor** → from PM-Kisan, pick the vendor you just approved, pay ₹4,000. (Only approved,
   ZK-enrolled, category-matched vendors appear — the scheme gate. Seeded vendors such as *Annapurna Agri
   Inputs* also appear but have no vendor login, so they can't self-redeem in step 4.)
3. **History** → the payment is **PAID** → click **Confirm delivery** → **DELIVERED**
   (proof-of-delivery; only delivered value is redeemable).

## 4. Vendor → RBI — redemption

1. Back in the vendor portal → **Redemptions** shows the **redeemable** (delivered) amount →
   *File a redemption* (amount ₹4,000, optional ITR number and bank account). It is filed on-chain via
   the relayer as **PENDING**. (Admin → Redemptions can still file on a vendor's behalf.)
2. **RBI (`/rbi`) → Redemptions** → the request is **PENDING** → **Approve**
   (after the ITR/legitimacy check). The e₹ is burned and a simulated **NEFT payout reference** is recorded;
   the vendor's **Redemptions** page shows it settled.

## 5. Fraud monitor (admin/RBI → Anomalies)

Make several rapid payments to one vendor (or have multiple citizens pay the same vendor). The Kafka-fed
detector raises **VELOCITY** / **FAN_IN** signals, visible (and resolvable) under **Anomalies**, with an
alert to admins. See `scripts/phase6-anomaly-smoke.ps1` to drive this automatically.

## 6. Public ledger (optional — The Graph)

```bash
npm run subgraph:deploy -w @bharatchain/indexer
```

Query the public, PII-free ledger at `http://localhost:8000/subgraphs/name/bharatchain/welfare`
(schemes, enrolments, claims, payments, redemptions + rollup stats).

## Hosted demo notes

The hosted stack (web on Vercel → API on Render free tier → Polygon Amoy + Neon + Upstash) behaves
differently from the local one:

- **Cold start:** after ~15 min idle the API takes 30–60s+ to wake. Warm it right before presenting with
  `GET https://bharatchain-backend.onrender.com/api/health`.
- **ZK proof is slow:** *Verify & submit* takes ~33s on Render's free CPU (vs ~1.7s locally) — narrate
  what's happening (Groth16 proof → on-chain enrolment) while it runs. Vendor approval generates proofs too.
- **Signup OTP:** shown on screen only while `OTP_EXPOSE_CODE=true` is set on Render; otherwise it is only
  in the Render logs (`[SIMULATED SMS]`).
- **Auto-disbursal:** the disbursal cron is on (`render.yaml`, every 2 min) and catches new enrollees up
  to the scheme's current installment, so a newly approved citizen may be credited (possibly more than
  ₹10,000) before you run a round manually.
- **Anomalies screen is empty** — Kafka is off on hosted (`KAFKA_ENABLED=false`); show §5 locally.
- **Don't use file-upload controls** — there is no object storage on hosted (uploads return 503).
- Admin/RBI use the hosted passwords, not the local defaults above.

## Tear down

```powershell
powershell -ExecutionPolicy Bypass -File scripts\demo-down.ps1
```
