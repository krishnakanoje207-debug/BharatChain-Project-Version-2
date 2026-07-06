import { expect } from "chai";
import * as path from "path";
import * as fs from "fs";
import { pathToFileURL } from "url";
import { deploySystem } from "./helpers/deploy";

const WASM = path.resolve(__dirname, "../../circuits/build/vendorEligibility_js/vendorEligibility.wasm");
const ZKEY = path.resolve(__dirname, "../../circuits/build/vendorEligibility_final.zkey");
const ZK_SRC = path.resolve(__dirname, "../../circuits/src/zk.mjs");

// `new Function` keeps ts-node (CommonJS) from down-levelling import() to require(), which would break
// these ESM-only modules (snarkjs, circomlibjs-backed zk.mjs).
const importDynamic = new Function("s", "return import(s)") as (s: string) => Promise<any>;

async function loadDeps() {
  const snarkjs = await importDynamic("snarkjs");
  const groth16 = snarkjs.groth16 ?? snarkjs.default?.groth16;
  const zk = await importDynamic(pathToFileURL(ZK_SRC).href);
  return { groth16, zk };
}

function parseCalldata(s: string): [string[], string[][], string[], string[]] {
  return JSON.parse("[" + s + "]");
}

// matches packages/shared VendorCategory uint8 order
const Cat = { AGRI_INPUT: 0, EDU_INSTITUTION: 1 };
const SchemeCategory = { AGRICULTURE: 0 };

describe("Vendor ZK verifier-gated enrollment", () => {
  before(function () {
    if (!fs.existsSync(WASM) || !fs.existsSync(ZKEY)) {
      this.skip(); // vendor circuit artifacts absent (e.g. CI without circom)
    }
  });

  it("enrolls a licensed, category-matching vendor via a real proof; rejects wrong root, reused nullifier, lapsed licence, category mismatch, and scheme-disallowed category", async () => {
    const sys = await deploySystem();
    const { admin, relayer, vendorA, vendorB } = sys.signers;
    const { schemes, vendorEnrollment, vendorZkEnroller } = sys;
    const { groth16, zk } = await loadDeps();

    // agriculture scheme that allows only AGRI_INPUT vendors
    await schemes
      .connect(admin)
      .createScheme("Agri", SchemeCategory.AGRICULTURE, 1000n, 100n, [Cat.AGRI_INPUT]);
    const schemeId = 0;

    const records = [
      { businessId: "23ABCDE1234A1ZQ", category: Cat.AGRI_INPUT, licenseValid: 1 }, // valid agri
      { businessId: "27FGHIJ5678B2ZP", category: Cat.AGRI_INPUT, licenseValid: 0 }, // lapsed licence
      { businessId: "09KLMNO9012C3ZR", category: Cat.EDU_INSTITUTION, licenseValid: 1 }, // valid edu
    ];
    const leaves: bigint[] = [];
    for (const r of records) leaves.push(await zk.vendorRecordLeaf(r));
    const tree = await zk.buildMerkleTree(leaves, 16);

    // --- valid agri vendor (index 0): real proof, requiredCategory = AGRI_INPUT ---
    const input = await zk.buildVendorEligibilityInput(records[0], tree, 0, schemeId, Cat.AGRI_INPUT);
    const { proof, publicSignals } = await groth16.fullProve(input, WASM, ZKEY);
    expect(publicSignals.length).to.equal(4); // [nullifier, root, schemeId, requiredCategory]
    const [a, b, c, signals] = parseCalldata(await groth16.exportSolidityCallData(proof, publicSignals));

    // wrong committed root → reject
    await vendorZkEnroller.connect(admin).setVendorRegistryRoot(1n);
    await expect(
      vendorZkEnroller.connect(relayer).enrollVendorWithProof(schemeId, vendorA.address, Cat.AGRI_INPUT, a, b, c, signals),
    ).to.be.revertedWithCustomError(vendorZkEnroller, "RootMismatch");

    // correct root → enrolls
    await vendorZkEnroller.connect(admin).setVendorRegistryRoot(tree.root);
    await vendorZkEnroller
      .connect(relayer)
      .enrollVendorWithProof(schemeId, vendorA.address, Cat.AGRI_INPUT, a, b, c, signals);
    expect(await vendorEnrollment.isEnrolled(schemeId, vendorA.address)).to.equal(true);

    // category arg disagreeing with the proof's public signal → CategoryMismatch (checked before verify)
    await expect(
      vendorZkEnroller
        .connect(relayer)
        .enrollVendorWithProof(schemeId, vendorB.address, Cat.EDU_INSTITUTION, a, b, c, signals),
    ).to.be.revertedWithCustomError(vendorZkEnroller, "CategoryMismatch");

    // reusing the proof (same nullifier) for another vendor → blocked
    await expect(
      vendorZkEnroller
        .connect(relayer)
        .enrollVendorWithProof(schemeId, vendorB.address, Cat.AGRI_INPUT, a, b, c, signals),
    ).to.be.revertedWithCustomError(vendorEnrollment, "NullifierAlreadyUsed");

    // --- lapsed licence (index 1): cannot even generate a proof (licenseValid === 1 fails) ---
    let threw = false;
    try {
      const badInput = await zk.buildVendorEligibilityInput(records[1], tree, 1, schemeId, Cat.AGRI_INPUT);
      await groth16.fullProve(badInput, WASM, ZKEY);
    } catch {
      threw = true;
    }
    expect(threw, "lapsed-licence proof generation should fail").to.equal(true);

    // --- valid EDU vendor (index 2): real proof for cat the scheme does NOT allow → CategoryNotAllowed ---
    const eduInput = await zk.buildVendorEligibilityInput(records[2], tree, 2, schemeId, Cat.EDU_INSTITUTION);
    const eduP = await groth16.fullProve(eduInput, WASM, ZKEY);
    const [ea, eb, ec, esignals] = parseCalldata(await groth16.exportSolidityCallData(eduP.proof, eduP.publicSignals));
    await expect(
      vendorZkEnroller
        .connect(relayer)
        .enrollVendorWithProof(schemeId, vendorB.address, Cat.EDU_INSTITUTION, ea, eb, ec, esignals),
    ).to.be.revertedWithCustomError(vendorZkEnroller, "CategoryNotAllowed");
  });
});
