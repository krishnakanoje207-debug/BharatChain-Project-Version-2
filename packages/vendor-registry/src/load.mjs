// Load the committed business/GST registry fixture and (re)build its Poseidon Merkle tree.
// Used by the backend for vendor eligibility lookup + ZK witness construction.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { vendorRecordLeaf, buildMerkleTree, getMerkleProof } from "@bharatchain/circuits/src/zk.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "..", "data");

export const VENDOR_REGISTRY_LEVELS = 16;

export function loadVendorRegistry() {
  return JSON.parse(readFileSync(join(dataDir, "vendors.json"), "utf8"));
}

export function loadVendorRegistryRoot() {
  return JSON.parse(readFileSync(join(dataDir, "vendors-root.json"), "utf8"));
}

/** Build the business registry Merkle tree (leaves in fixture order). Returns { tree, leaves }. */
export async function buildVendorRegistryTree(records = loadVendorRegistry(), levels = VENDOR_REGISTRY_LEVELS) {
  const leaves = [];
  for (const r of records) leaves.push(await vendorRecordLeaf(r));
  const tree = await buildMerkleTree(leaves, levels);
  return { tree, leaves };
}

export { getMerkleProof };
