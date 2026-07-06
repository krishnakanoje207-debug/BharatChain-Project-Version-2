pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

// Hash a left/right pair with Poseidon (internal Merkle node).
template HashLeftRight() {
    signal input left;
    signal input right;
    signal output hash;
    component h = Poseidon(2);
    h.inputs[0] <== left;
    h.inputs[1] <== right;
    hash <== h.out;
}

// Selects (left,right) ordering from (current, sibling) using path bit s (0 => current is left).
template DualMux() {
    signal input in[2];
    signal input s;
    signal output out[2];
    s * (1 - s) === 0; // s must be boolean
    out[0] <== (in[1] - in[0]) * s + in[0];
    out[1] <== (in[0] - in[1]) * s + in[1];
}

// Recompute the Merkle root from a leaf + path; output the root.
template MerkleProof(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal output root;

    component selectors[levels];
    component hashers[levels];

    for (var i = 0; i < levels; i++) {
        selectors[i] = DualMux();
        selectors[i].in[0] <== (i == 0) ? leaf : hashers[i - 1].hash;
        selectors[i].in[1] <== pathElements[i];
        selectors[i].s <== pathIndices[i];

        hashers[i] = HashLeftRight();
        hashers[i].left <== selectors[i].out[0];
        hashers[i].right <== selectors[i].out[1];
    }

    root <== hashers[levels - 1].hash;
}

// BharatChain eligibility circuit.
//
// Proves, without revealing which record, that the applicant knows a government-registry record
// (Merkle-inclusion under the committed `root`) that satisfies the eligibility predicate FOR THE
// SCHEME'S SECTOR. The sector is the public input `schemeCategory`, bound on-chain to the scheme's
// actual category (SchemeRegistry.categoryOf) by ZKEnroller — so a proof minted for one sector can't
// enrol a scheme of another. Outputs a per-scheme nullifier derived from the canonical identity (PAN).
//
// Profession codes: 0 = unknown/unregistered, 1 = farmer, 2 = known non-farmer.
// Per-sector predicate (schemeCategory matches packages/shared SchemeCategory uint8 order):
//   0 AGRICULTURE : profession == FARMER, OR (profession == UNKNOWN AND has a Kissan card AND land).
//   1 EDUCATION   : Post-Matric scholarship — must be an enrolled student of a reserved category
//                   (SC/ST/OBC/EBC/Minority; NOT General) AND family income <= that category's cap
//                   (SC/ST 250k, OBC 150k, EBC 100k, Minority 200k). Income alone is NOT sufficient.
//   2 HOUSING     : PMAY-Gramin — dwelling is kutcha OR houseless AND income <= 180000 (₹15k/month
//                   line) AND not otherwise excluded (income-tax payer / large landholding / govt job).
// A record that fails its sector's predicate can produce no valid proof (eligible === 1 fails).
template Eligibility(levels) {
    // --- private inputs (the matched registry record + its Merkle path) ---
    signal input pan;        // canonical identity (field-encoded PAN)
    signal input kissan;     // Kissan-card id (0 if none)
    signal input land;       // land-record id (0 if none)
    signal input profession; // 0 unknown | 1 farmer | 2 non-farmer
    signal input income;     // annual income (rupees) — drives the means-tested sectors
    signal input isStudent;  // 1 if an enrolled student (education)
    signal input caste;      // 0 General | 1 SC | 2 ST | 3 OBC | 4 EBC | 5 Minority (education)
    signal input houseStatus; // 0 adequate/pucca | 1 kutcha | 2 houseless (housing)
    signal input housingExcluded; // 1 if hit by a PMAY-G non-income exclusion (housing)
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // --- public inputs ---
    signal input root;
    signal input schemeId;
    signal input schemeCategory; // scheme sector: 0 agri | 1 education | 2 housing

    // --- output ---
    signal output nullifier;

    // Per-category education income ceilings + the housing income line. Tune here + recompile.
    var EDU_CAP_SC = 250000;
    var EDU_CAP_ST = 250000;
    var EDU_CAP_OBC = 150000;
    var EDU_CAP_EBC = 100000;
    var EDU_CAP_MINORITY = 200000;
    var HOUSING_INCOME_CAP = 180000;

    // 1. Reconstruct the registry leaf and prove Merkle inclusion under `root`.
    component leafHash = Poseidon(9);
    leafHash.inputs[0] <== pan;
    leafHash.inputs[1] <== kissan;
    leafHash.inputs[2] <== land;
    leafHash.inputs[3] <== profession;
    leafHash.inputs[4] <== income;
    leafHash.inputs[5] <== isStudent;
    leafHash.inputs[6] <== caste;
    leafHash.inputs[7] <== houseStatus;
    leafHash.inputs[8] <== housingExcluded;

    component mp = MerkleProof(levels);
    mp.leaf <== leafHash.out;
    for (var i = 0; i < levels; i++) {
        mp.pathElements[i] <== pathElements[i];
        mp.pathIndices[i] <== pathIndices[i];
    }
    root === mp.root;

    // 2a. AGRICULTURE predicate: farmer OR (unknown AND has Kissan card AND land record).
    component isFarmer = IsEqual();
    isFarmer.in[0] <== profession;
    isFarmer.in[1] <== 1;

    component isUnknown = IsEqual();
    isUnknown.in[0] <== profession;
    isUnknown.in[1] <== 0;

    component kissanIsZero = IsZero();
    kissanIsZero.in <== kissan;
    component landIsZero = IsZero();
    landIsZero.in <== land;

    signal hasKissan;
    hasKissan <== 1 - kissanIsZero.out;
    signal hasLand;
    hasLand <== 1 - landIsZero.out;

    signal fallbackA;
    fallbackA <== isUnknown.out * hasKissan;
    signal fallbackB;
    fallbackB <== fallbackA * hasLand;

    // isFarmer and fallbackB are mutually exclusive, so their sum is 0 or 1.
    signal agriEligible;
    agriEligible <== isFarmer.out + fallbackB;

    // 2b. EDUCATION predicate (Post-Matric scholarship): enrolled student, of a reserved
    //     category (not General), with family income <= that category's ceiling.
    component isSc = IsEqual();
    isSc.in[0] <== caste; isSc.in[1] <== 1;
    component isSt = IsEqual();
    isSt.in[0] <== caste; isSt.in[1] <== 2;
    component isObc = IsEqual();
    isObc.in[0] <== caste; isObc.in[1] <== 3;
    component isEbc = IsEqual();
    isEbc.in[0] <== caste; isEbc.in[1] <== 4;
    component isMinority = IsEqual();
    isMinority.in[0] <== caste; isMinority.in[1] <== 5;

    // Reserved-category flags are mutually exclusive → sum is 0 (General) or 1.
    signal reservedCaste;
    reservedCaste <== isSc.out + isSt.out + isObc.out + isEbc.out + isMinority.out;

    // The applicable income cap for this citizen's category (0 for General → always fails).
    signal eduCap;
    eduCap <== isSc.out * EDU_CAP_SC + isSt.out * EDU_CAP_ST + isObc.out * EDU_CAP_OBC
             + isEbc.out * EDU_CAP_EBC + isMinority.out * EDU_CAP_MINORITY;

    component eduLe = LessEqThan(32);
    eduLe.in[0] <== income;
    eduLe.in[1] <== eduCap;

    // eligible = isStudent AND reservedCaste AND income<=cap (product of three 0/1 signals).
    signal eduStudentReserved;
    eduStudentReserved <== isStudent * reservedCaste;
    signal eduEligible;
    eduEligible <== eduStudentReserved * eduLe.out;

    // 2c. HOUSING predicate (PMAY-Gramin): (kutcha OR houseless) AND income<=cap AND not excluded.
    component isKutcha = IsEqual();
    isKutcha.in[0] <== houseStatus; isKutcha.in[1] <== 1;
    component isHouseless = IsEqual();
    isHouseless.in[0] <== houseStatus; isHouseless.in[1] <== 2;

    // Kutcha and houseless are mutually exclusive → sum is 0 or 1.
    signal needyHouse;
    needyHouse <== isKutcha.out + isHouseless.out;

    component houLe = LessEqThan(32);
    houLe.in[0] <== income;
    houLe.in[1] <== HOUSING_INCOME_CAP;

    signal notExcluded;
    notExcluded <== 1 - housingExcluded;

    signal houseAndIncome;
    houseAndIncome <== needyHouse * houLe.out;
    signal housingEligible;
    housingEligible <== houseAndIncome * notExcluded;

    // 3. Select the predicate for this scheme's sector. The three selectors are mutually exclusive,
    //    so `eligible` is 0 or 1 (and 0 for any sector without a predicate — unprovable, as intended).
    component isAgri = IsEqual();
    isAgri.in[0] <== schemeCategory;
    isAgri.in[1] <== 0;
    component isEdu = IsEqual();
    isEdu.in[0] <== schemeCategory;
    isEdu.in[1] <== 1;
    component isHousing = IsEqual();
    isHousing.in[0] <== schemeCategory;
    isHousing.in[1] <== 2;

    signal selAgri;
    selAgri <== isAgri.out * agriEligible;
    signal selEdu;
    selEdu <== isEdu.out * eduEligible;
    signal selHousing;
    selHousing <== isHousing.out * housingEligible;

    signal eligible;
    eligible <== selAgri + selEdu + selHousing;
    eligible === 1;

    // 4. Per-scheme nullifier from the canonical identity.
    component nl = Poseidon(2);
    nl.inputs[0] <== pan;
    nl.inputs[1] <== schemeId;
    nullifier <== nl.out;
}

component main {public [root, schemeId, schemeCategory]} = Eligibility(16);
