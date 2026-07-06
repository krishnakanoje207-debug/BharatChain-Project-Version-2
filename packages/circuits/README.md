# @bharatchain/circuits

Zero-knowledge circuits (Circom + snarkjs, Groth16) for eligibility.

## `eligibility` circuit (`circuits/eligibility.circom`)

Proves, without revealing which record:

> *"I know a record in the government reference registry (Poseidon-leaf Merkle-inclusion under the
> on-chain-committed `root`) whose document IDs match, and it satisfies the scheme's eligibility
> predicate"*, and outputs **`nullifier = Poseidon(pan, schemeId)`** — derived in-circuit from the
> canonical identity, so the same person yields the same nullifier per scheme.

- **Public inputs:** `root`, `schemeId`. **Output:** `nullifier`.
- **Private inputs:** the matched record (`pan, kissan, land, profession, income`) + Merkle path.
- **Predicate (agriculture):** `profession == FARMER`, OR `profession == UNKNOWN AND has Kissan card AND
  has land record`. A known non-farmer can produce **no** valid proof (the `eligible === 1` constraint
  fails) — which is exactly the "this scheme is only valid for farmers" rejection.
- Tree depth 16 (up to 65,536 registry records).

## JS tooling (`src/zk.mjs`) — verified ✓

Same Poseidon as the circuit, so the JS Merkle root matches the circuit's:
- `recordLeaf`, `buildMerkleTree`, `getMerkleProof`, `buildEligibilityInput`, `computeNullifier`.
- Self-test: `npm run zk:tree-check -w @bharatchain/circuits` (no circom needed) — confirms every proof
  recomputes the committed root.

## Build (needs the `circom` binary on PATH)

```bash
npm run zk:build -w @bharatchain/circuits
```

Compiles the circuit, downloads the public Hermez powers-of-tau, runs the Groth16 setup, and exports:
- `build/eligibility_final.zkey` + `build/eligibility_js/eligibility.wasm` (proving)
- `build/verification_key.json`
- `../contracts/contracts/Verifier.sol` (the on-chain Groth16 verifier)

Build artifacts (`build/`, `*.zkey`, `*.wasm`, `*.ptau`, `*.r1cs`) are gitignored.

## Next (Phase 2 wrap-up, after `circom` is installed)

Generate the verifier, add a verifier-gated enroll path (`BeneficiaryRegistry` consults `Verifier.sol`),
and add a proof-generation + enroll test.
