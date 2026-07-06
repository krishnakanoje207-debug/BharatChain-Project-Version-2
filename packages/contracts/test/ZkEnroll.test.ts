import { expect } from "chai";
import * as path from "path";
import * as fs from "fs";
import { pathToFileURL } from "url";
import { deploySystem } from "./helpers/deploy";

const WASM = path.resolve(__dirname, "../../circuits/build/eligibility_js/eligibility.wasm");
const ZKEY = path.resolve(__dirname, "../../circuits/build/eligibility_final.zkey");
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

// SchemeCategory uint8 order (packages/shared) + the vendor cats each sector allows.
const Sector = { AGRICULTURE: 0, EDUCATION: 1, HOUSING: 2 };

describe("ZK verifier-gated enrollment (per-scheme predicate)", () => {
  before(function () {
    if (!fs.existsSync(WASM) || !fs.existsSync(ZKEY)) {
      this.skip(); // build artifacts absent (e.g. CI without circom)
    }
  });

  it("enforces the scheme's sector predicate, binds the sector to the scheme, and rejects wrong root / reused nullifier", async () => {
    const sys = await deploySystem();
    const { admin, relayer, citizen1, citizen2 } = sys.signers;
    const { beneficiaries, zkEnroller, schemes } = sys;
    const { groth16, zk } = await loadDeps();

    // three schemes, one per sector
    await schemes.connect(admin).createScheme("Agri", Sector.AGRICULTURE, 10n ** 24n, 1n, [0]);
    await schemes.connect(admin).createScheme("Scholarship", Sector.EDUCATION, 10n ** 24n, 1n, [1, 2]);
    await schemes.connect(admin).createScheme("Housing", Sector.HOUSING, 10n ** 24n, 1n, [3]);
    const AGRI = 0, EDU = 1, HOUSING = 2;

    // registry records exercising every predicate
    // (education: isStudent + reserved caste + income under the caste cap;
    //  housing: kutcha/houseless + income <= 180k + not excluded)
    const records = [
      // farmer, high income, General non-student, adequate house → agri-only
      { pan: "ABCDE1234F", kissan: "KCC0001", land: "LR0001", profession: 1, income: 400000,
        isStudent: 0, caste: 0, houseStatus: 0, housingExcluded: 0 },
      // non-farmer OBC student, ₹90k, kutcha house → education + housing eligible
      { pan: "PQRST5678K", kissan: "", land: "", profession: 2, income: 90000,
        isStudent: 1, caste: 3, houseStatus: 1, housingExcluded: 0 },
      // unknown+docs, ₹300k, kutcha but over the housing income line → agri fallback only
      { pan: "LMNOP9012Z", kissan: "KCC0003", land: "LR0003", profession: 0, income: 300000,
        isStudent: 0, caste: 1, houseStatus: 1, housingExcluded: 0 },
    ];
    const leaves: bigint[] = [];
    for (const r of records) leaves.push(await zk.recordLeaf(r));
    const tree = await zk.buildMerkleTree(leaves, 16);

    const prove = async (idx: number, schemeId: number, sector: number) => {
      const input = await zk.buildEligibilityInput(records[idx], tree, idx, schemeId, sector);
      const { proof, publicSignals } = await groth16.fullProve(input, WASM, ZKEY);
      expect(publicSignals.length).to.equal(4); // [nullifier, root, schemeId, schemeCategory]
      return parseCalldata(await groth16.exportSolidityCallData(proof, publicSignals));
    };

    // --- AGRICULTURE: farmer (idx 0) eligible ---
    const [a0, b0, c0, s0] = await prove(0, AGRI, Sector.AGRICULTURE);

    // wrong committed root → reject
    await zkEnroller.connect(admin).setRegistryRoot(1n);
    await expect(
      zkEnroller.connect(relayer).enrollWithProof(AGRI, citizen1.address, a0, b0, c0, s0),
    ).to.be.revertedWithCustomError(zkEnroller, "RootMismatch");

    // correct root → enrolls in the agri scheme
    await zkEnroller.connect(admin).setRegistryRoot(tree.root);
    await zkEnroller.connect(relayer).enrollWithProof(AGRI, citizen1.address, a0, b0, c0, s0);
    expect(await beneficiaries.isEnrolled(AGRI, citizen1.address)).to.equal(true);

    // reusing the proof (same nullifier) for another address → blocked
    await expect(
      zkEnroller.connect(relayer).enrollWithProof(AGRI, citizen2.address, a0, b0, c0, s0),
    ).to.be.revertedWithCustomError(beneficiaries, "NullifierAlreadyUsed");

    // --- SECTOR BIND: an agri-predicate proof minted for scheme EDU (schemeId matches, sector 0) ---
    // is rejected because the scheme's category is EDUCATION (1), not what the proof attests (0).
    const [am, bm, cm, sm] = await prove(0, EDU, Sector.AGRICULTURE);
    await expect(
      zkEnroller.connect(relayer).enrollWithProof(EDU, citizen2.address, am, bm, cm, sm),
    ).to.be.revertedWithCustomError(zkEnroller, "CategoryMismatch");

    // --- EDUCATION: OBC student at ₹90k (≤ the OBC cap of ₹150k) eligible ---
    const [a1, b1, c1, s1] = await prove(1, EDU, Sector.EDUCATION);
    await zkEnroller.connect(relayer).enrollWithProof(EDU, citizen2.address, a1, b1, c1, s1);
    expect(await beneficiaries.isEnrolled(EDU, citizen2.address)).to.equal(true);

    // a General-category non-student (idx 0) cannot generate an EDUCATION proof at all
    let threw = false;
    try {
      await prove(0, EDU, Sector.EDUCATION);
    } catch {
      threw = true;
    }
    expect(threw, "General non-student education proof should fail").to.equal(true);

    // --- HOUSING: kutcha dwelling at ₹90k (≤ 180k, not excluded) eligible;
    //     the ₹300k kutcha record (idx 2) fails the PMAY-G income line ---
    const [a2, b2, c2, s2] = await prove(1, HOUSING, Sector.HOUSING);
    await zkEnroller.connect(relayer).enrollWithProof(HOUSING, citizen2.address, a2, b2, c2, s2);
    expect(await beneficiaries.isEnrolled(HOUSING, citizen2.address)).to.equal(true);

    let housingThrew = false;
    try {
      await prove(2, HOUSING, Sector.HOUSING);
    } catch {
      housingThrew = true;
    }
    expect(housingThrew, "over-income housing proof should fail").to.equal(true);

    // --- a non-farmer (idx 1) cannot generate an AGRICULTURE proof ---
    let agriThrew = false;
    try {
      await prove(1, AGRI, Sector.AGRICULTURE);
    } catch {
      agriThrew = true;
    }
    expect(agriThrew, "non-farmer agriculture proof should fail").to.equal(true);
  });
});
