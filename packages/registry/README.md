# @bharatchain/registry

The **fixed government citizen reference registry** — the "official government data" that eligibility is
checked against. It is generated **once** with a fixed seed and **committed** (`data/registry.json`); it
must **never** be randomized at runtime. Real citizens are appended on request.

## Contents

- `src/generate.mjs` — deterministic generator (fixed seed `20260621`).
- `data/registry.json` — the committed 10,000-record fixture (source of truth).
- `data/registry-root.json` — the committed Poseidon Merkle root (depth 16) + count.
- `src/load.mjs` — `loadRegistry()`, `loadRegistryRoot()`, `buildRegistryTree()` for the backend
  (eligibility lookup + ZK witness construction).

## Composition (covers every eligibility path)

~40% farmers (eligible), ~35% non-farmers (rejected), ~25% unknown profession — ~60% of those carry a
Kissan card + land record (eligible via the document fallback). Each record stores **document unique IDs**
(PAN, Kissan-card no., land-record id) — matching those IDs *is* the verification.

## Regenerate

```bash
npm run build:registry -w @bharatchain/registry
```

Deterministic — the same fixture and root every time. The root is committed on-chain via
`ZKEnroller.setRegistryRoot()` during backend seeding (Phase 3).
