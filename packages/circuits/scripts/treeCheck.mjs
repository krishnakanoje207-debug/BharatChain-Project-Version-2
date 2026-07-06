// Self-test of the JS Poseidon/Merkle tooling (no circom required).
// Verifies that getMerkleProof recomputes the tree root exactly as the circuit's MerkleProof will.
import { recordLeaf, buildMerkleTree, getMerkleProof, buildEligibilityInput, computeNullifier, getPoseidon } from "../src/zk.mjs";

const LEVELS = 16;

const records = [
  { pan: "ABCDE1234F", kissan: "KCC0001", land: "LR0001", profession: 1, income: 50000 }, // farmer
  { pan: "PQRST5678K", kissan: "", land: "", profession: 2, income: 90000 }, // known non-farmer
  { pan: "LMNOP9012Z", kissan: "KCC0003", land: "LR0003", profession: 0, income: 30000 }, // unknown + docs
];

const p = await getPoseidon();
const hp = (a, b) => p.F.toObject(p([a, b]));

const leaves = [];
for (const r of records) leaves.push(await recordLeaf(r));

const tree = await buildMerkleTree(leaves, LEVELS);
console.log("Merkle root:", tree.root.toString());

let allOk = true;
for (let i = 0; i < records.length; i++) {
  const { pathElements, pathIndices } = getMerkleProof(tree, i);
  let cur = leaves[i];
  for (let l = 0; l < LEVELS; l++) {
    cur = pathIndices[l] ? hp(pathElements[l], cur) : hp(cur, pathElements[l]);
  }
  const ok = cur === tree.root;
  allOk = allOk && ok;
  console.log(`record ${i} (profession=${records[i].profession}): proof recomputes root = ${ok}`);
}

const input = await buildEligibilityInput(records[0], tree, 0, 0);
console.log("circuit input keys:", Object.keys(input).join(", "));
console.log("nullifier(pan0, scheme0):", (await computeNullifier(records[0].pan, 0)).toString());

if (!allOk) {
  console.error("FAIL: a proof did not recompute the root");
  process.exit(1);
}
console.log("OK: all Merkle proofs recompute the root.");
