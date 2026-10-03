// Load the committed government registry fixture and (re)build its Poseidon Merkle tree.
// Used by the backend for eligibility lookup + ZK witness construction.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import {
  recordLeaf,
  buildMerkleTree,
  getMerkleProof,
  yieldToEventLoop,
} from "@bharatchain/circuits/src/zk.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "..", "data");

export const REGISTRY_LEVELS = 16;

export function loadRegistry() {
  return JSON.parse(readFileSync(join(dataDir, "registry.json"), "utf8"));
}

export function loadRegistryRoot() {
  return JSON.parse(readFileSync(join(dataDir, "registry-root.json"), "utf8"));
}

/** JSON-safe form of a tree from buildMerkleTree (BigInts as decimal strings). */
export function serializeRegistryTree(tree) {
  const str = (xs) => xs.map((x) => x.toString());
  return { root: tree.root.toString(), levels: tree.levels, zeros: str(tree.zeros), layers: tree.layers.map(str) };
}

/**
 * The committed precomputed tree (data/registry-tree.json), or null when it is missing or does not
 * match the committed root. Hashing the 10k-record tree costs ~12s of synchronous CPU locally (far
 * more on a shared free-tier core) on every cold start; the registry is fixed, so the tree is too.
 */
function loadPrecomputedTree(count, levels) {
  let saved;
  try {
    saved = JSON.parse(readFileSync(join(dataDir, "registry-tree.json"), "utf8"));
  } catch {
    return null;
  }
  const root = loadRegistryRoot().root;
  if (saved.levels !== levels || saved.root !== root || saved.layers[0].length !== count) return null;
  if (saved.layers[levels][0] !== root) return null;
  return {
    root: BigInt(saved.root),
    layers: saved.layers.map((layer) => layer.map(BigInt)),
    levels,
    zeros: saved.zeros.map(BigInt),
  };
}

/** Build the registry Merkle tree (leaves in fixture order). Returns { tree, leaves }. */
export async function buildRegistryTree(records = loadRegistry(), levels = REGISTRY_LEVELS) {
  const precomputed = loadPrecomputedTree(records.length, levels);
  if (precomputed) return { tree: precomputed, leaves: precomputed.layers[0] };

  const leaves = [];
  for (const r of records) {
    leaves.push(await recordLeaf(r));
    if (leaves.length % 256 === 0) await yieldToEventLoop();
  }
  const tree = await buildMerkleTree(leaves, levels);
  return { tree, leaves };
}

export { getMerkleProof };
