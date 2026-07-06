pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

// Hash a left/right pair with Poseidon (internal Merkle node).
template VHashLeftRight() {
    signal input left;
    signal input right;
    signal output hash;
    component h = Poseidon(2);
    h.inputs[0] <== left;
    h.inputs[1] <== right;
    hash <== h.out;
}

// Selects (left,right) ordering from (current, sibling) using path bit s (0 => current is left).
template VDualMux() {
    signal input in[2];
    signal input s;
    signal output out[2];
    s * (1 - s) === 0; // s must be boolean
    out[0] <== (in[1] - in[0]) * s + in[0];
    out[1] <== (in[0] - in[1]) * s + in[1];
}

// Recompute the Merkle root from a leaf + path; output the root.
template VMerkleProof(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal output root;

    component selectors[levels];
    component hashers[levels];

    for (var i = 0; i < levels; i++) {
        selectors[i] = VDualMux();
        selectors[i].in[0] <== (i == 0) ? leaf : hashers[i - 1].hash;
        selectors[i].in[1] <== pathElements[i];
        selectors[i].s <== pathIndices[i];

        hashers[i] = VHashLeftRight();
        hashers[i].left <== selectors[i].out[0];
        hashers[i].right <== selectors[i].out[1];
    }

    root <== hashers[levels - 1].hash;
}

// BharatChain vendor eligibility circuit (symmetric to the citizen eligibility circuit).
//
// Proves, without revealing which record, that a vendor knows a business-registry record
// (Merkle-inclusion under the committed `root`) that (a) holds a VALID trade licence and
// (b) is registered under the vendor category the scheme requires. Outputs a per-scheme
// nullifier derived from the canonical business id, so the same business yields the same
// nullifier per scheme (blocks a business enrolling the same scheme twice, even via a
// different payout address).
//
// licenseValid: 1 = valid/active trade licence, 0 = lapsed/none (a lapsed business can
// produce NO valid proof — the licenseValid === 1 constraint fails, mirroring how a known
// non-farmer cannot prove citizen eligibility).
template VendorEligibility(levels) {
    // --- private inputs (the matched business record + its Merkle path) ---
    signal input businessId;   // canonical business id (field-encoded GSTIN)
    signal input category;     // VendorCategory enum (0..3)
    signal input licenseValid; // 1 if the trade licence is valid, else 0
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // --- public inputs ---
    signal input root;
    signal input schemeId;
    signal input requiredCategory; // the vendor category the scheme requires (bound on-chain)

    // --- output ---
    signal output nullifier;

    // 1. Reconstruct the business leaf and prove Merkle inclusion under `root`.
    component leafHash = Poseidon(3);
    leafHash.inputs[0] <== businessId;
    leafHash.inputs[1] <== category;
    leafHash.inputs[2] <== licenseValid;

    component mp = VMerkleProof(levels);
    mp.leaf <== leafHash.out;
    for (var i = 0; i < levels; i++) {
        mp.pathElements[i] <== pathElements[i];
        mp.pathIndices[i] <== pathIndices[i];
    }
    root === mp.root;

    // 2. Eligibility predicate: licence valid AND category matches what the scheme requires.
    licenseValid === 1;

    component catEq = IsEqual();
    catEq.in[0] <== category;
    catEq.in[1] <== requiredCategory;
    catEq.out === 1;

    // 3. Per-scheme nullifier from the canonical business id.
    component nl = Poseidon(2);
    nl.inputs[0] <== businessId;
    nl.inputs[1] <== schemeId;
    nullifier <== nl.out;
}

component main {public [root, schemeId, requiredCategory]} = VendorEligibility(16);
