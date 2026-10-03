// Write data/registry-tree.json from the EXISTING committed fixture (never regenerates the registry).
//   npm run build:tree -w @bharatchain/registry
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { recordLeaf, buildMerkleTree } from "@bharatchain/circuits/src/zk.mjs";
import { loadRegistry, loadRegistryRoot, serializeRegistryTree, REGISTRY_LEVELS } from "../src/load.mjs";

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data");

console.log("hashing the registry tree (~15s)...");
const leaves = [];
for (const r of loadRegistry()) leaves.push(await recordLeaf(r));
const tree = await buildMerkleTree(leaves, REGISTRY_LEVELS);

const committed = loadRegistryRoot().root;
if (tree.root.toString() !== committed) {
  console.error(`root mismatch: computed ${tree.root} != committed ${committed} — not writing`);
  process.exit(1);
}
writeFileSync(join(dataDir, "registry-tree.json"), JSON.stringify(serializeRegistryTree(tree)));
console.log("root matches committed root; saved -> data/registry-tree.json");
