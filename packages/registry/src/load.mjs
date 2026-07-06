// Load the committed government registry fixture and (re)build its Poseidon Merkle tree.
// Used by the backend for eligibility lookup + ZK witness construction.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { recordLeaf, buildMerkleTree, getMerkleProof } from "@bharatchain/circuits/src/zk.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "..", "data");

export const REGISTRY_LEVELS = 16;

export function loadRegistry() {
  return JSON.parse(readFileSync(join(dataDir, "registry.json"), "utf8"));
}

export function loadRegistryRoot() {
  return JSON.parse(readFileSync(join(dataDir, "registry-root.json"), "utf8"));
}

/** Build the registry Merkle tree (leaves in fixture order). Returns { tree, leaves }. */
export async function buildRegistryTree(records = loadRegistry(), levels = REGISTRY_LEVELS) {
  const leaves = [];
  for (const r of records) leaves.push(await recordLeaf(r));
  const tree = await buildMerkleTree(leaves, levels);
  return { tree, leaves };
}

export { getMerkleProof };
