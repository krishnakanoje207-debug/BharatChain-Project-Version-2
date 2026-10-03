// Generate the fixed registry fixture + commit its Merkle root.
//   npm run build:registry -w @bharatchain/registry
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { generateRegistry } from "../src/generate.mjs";
import { recordLeaf, buildMerkleTree } from "@bharatchain/circuits/src/zk.mjs";
import { serializeRegistryTree } from "../src/load.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "..", "data");

const COUNT = 10000;
const LEVELS = 16;

const records = generateRegistry(COUNT);
mkdirSync(dataDir, { recursive: true });
writeFileSync(join(dataDir, "registry.json"), JSON.stringify(records));

const stat = { farmer: 0, nonFarmer: 0, unknown: 0, unknownWithDocs: 0, withEmail: 0 };
for (const r of records) {
  if (r.profession === 1) stat.farmer++;
  else if (r.profession === 2) stat.nonFarmer++;
  else {
    stat.unknown++;
    if (r.kissan && r.land) stat.unknownWithDocs++;
  }
  if (r.email) stat.withEmail++;
}
console.log(`records: ${records.length}`);
console.log(stat);

console.log("building Poseidon Merkle tree (this takes ~20s)...");
const leaves = [];
for (const r of records) leaves.push(await recordLeaf(r));
const tree = await buildMerkleTree(leaves, LEVELS);

writeFileSync(
  join(dataDir, "registry-root.json"),
  JSON.stringify({ root: tree.root.toString(), count: records.length, levels: LEVELS }, null, 2),
);
writeFileSync(join(dataDir, "registry-tree.json"), JSON.stringify(serializeRegistryTree(tree)));
console.log("registry root:", tree.root.toString());
console.log("saved -> data/registry.json + data/registry-root.json + data/registry-tree.json");
