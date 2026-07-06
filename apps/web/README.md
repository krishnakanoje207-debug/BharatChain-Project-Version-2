# @bharatchain/web

Frontend for BharatChain. **Framework not yet chosen** — built in Phase 8.

## Design language (locked)

Mimics the **india.gov.in National Portal**:
- deep navy / government-blue hero with a monument backdrop
- saffron (`#FF9933`) + red/maroon (`#C8102E`) accent buttons
- white card surfaces, Ashoka emblem + "Satyameva Jayate"
- prominent centered search, trending chips, stats-card row, formal footer
- accessibility controls: skip-to-content, font-size +/–, language switch, high-contrast

## Surfaces (likely separate builds/origins)

1. **Public website** — schemes browse (grouped by category), public ledger, citizen/vendor signup +
   login, apply flow, citizen dashboard, AI assistant widget.
2. **Token app (UPI-style)** — citizen wallet, pay-vendor (verify-before-pay), confirm-delivery, history;
   vendor redemption.
3. **Admin portal** — vendor approvals, "Vendors" section, citizen applications, add schemes.
4. **RBI portal** — ITR/legitimacy approval, simulated payout, disbursal triggers (date/time), treasury.

See `docs/IMPLEMENTATION_PLAN.md` §8.
