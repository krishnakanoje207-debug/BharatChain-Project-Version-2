# BharatChain — Demo Walkthrough

A 10-minute end-to-end demo of the full welfare lifecycle:
**apply → ZK eligibility → disburse → pay vendor → confirm delivery → RBI redemption**, plus
the fraud monitor and the AI assistant.

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

> **Demo logins (both seeded).** Admin: **9000000000 / admin12345** (role `ADMIN`). RBI: **9000000001 /
> rbiadmin12345** (role `RBI_ADMIN`). Override via `ADMIN_PHONE`/`ADMIN_PASSWORD` and `RBI_PHONE`/`RBI_PASSWORD`.

> **Eligible farmer PANs** (from the fixed government registry): `LJAAN1880Y`, `LEFSK8542C`, `JSQUP2551W`,
> `WMRTS2648Z`. Each PAN can enrol a scheme only once (the ZK nullifier prevents double-dipping), so use a
> fresh PAN per new citizen. A non-farmer PAN (e.g. `DYCNH0035D`) will be **rejected** — good to show.

## 1. Public site (`:3000`) — discover + apply

1. **Home** — government-portal hero, search, live stats, and "Government Schemes" grouped by sector.
2. **Sign up** (phone + password → simulated OTP, shown on screen) → land on the **Dashboard**.
3. **Apply** → pick **PM-Kisan Samman Nidhi** → enter PAN `LJAAN1880Y` → *Verify & submit*.
   A zero-knowledge proof is generated and the relayer enrols you on-chain → **APPROVED**.
   (Try a non-farmer PAN to show a **REJECTED** result — the proof fails, no PII revealed.)
4. Open the **💬 assistant** (bottom-right — it's there even **before signing in**):
   - Logged **out** (public info desk): ask *"What is BharatChain?"*, *"How do I become an approved
     vendor?"* (full onboarding walkthrough with signup links), or *"Which schemes are open right
     now?"*. Ask *"What is my balance?"* to show it refuses personal questions and invites sign-in.
   - Logged **in** as a citizen: ask *"What is my application status?"*, *"How much balance do I
     have?"* — grounded in your own data, in any of the 14 site languages.

## 2. Admin (`/admin`) — disburse

1. Login **9000000000 / admin12345** → you land on the admin portal.
2. **Disbursement** → **Run round** on PM-Kisan → every enrolled citizen is credited ₹10,000 e₹
   (the scheme fund draws down). The **Overview** tab shows outlay vs disbursed.

## 3. Citizen wallet (`/citizen`) — pay + confirm delivery

1. Login as the citizen → **Wallet** shows the ₹10,000 e₹ balance.
2. **Pay a Vendor** → from PM-Kisan, pick an approved agri-input vendor (e.g. *Annapurna Agri Inputs*),
   pay ₹4,000. (Only category-matched vendors appear — the scheme gate.)
3. **History** → the payment is **PAID** → click **Confirm delivery** → **DELIVERED**
   (proof-of-delivery; only delivered value is redeemable).

## 4. Admin → RBI — redemption

1. **Admin → Redemptions** → *File a redemption* for the vendor (amount ₹4,000 + ITR reference).
2. **RBI (`/rbi`) → Redemptions** → the request is **PENDING** → **Approve**
   (after the ITR/legitimacy check). The e₹ is burned and a simulated **NEFT payout reference** is recorded.

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

## Tear down

```powershell
powershell -ExecutionPolicy Bypass -File scripts\demo-down.ps1
```
