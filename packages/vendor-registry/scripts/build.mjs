// Generate the fixed business/GST registry fixture + commit its Merkle root.
//   npm run build:registry -w @bharatchain/vendor-registry
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { generateVendorRegistry, CATEGORY_LABEL } from "../src/generate.mjs";
import { vendorRecordLeaf, buildMerkleTree } from "@bharatchain/circuits/src/zk.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "..", "data");

const LEVELS = 16;

const records = generateVendorRegistry();
mkdirSync(dataDir, { recursive: true });
writeFileSync(join(dataDir, "vendors.json"), JSON.stringify(records, null, 2));

const stat = { total: records.length, valid: 0, lapsed: 0, byCategory: {} };
for (const r of records) {
  if (r.licenseValid) stat.valid++;
  else stat.lapsed++;
  const label = CATEGORY_LABEL[r.category];
  stat.byCategory[label] = (stat.byCategory[label] ?? 0) + 1;
}
console.log(`business records: ${records.length}`);
console.log(stat);

console.log("building Poseidon Merkle tree...");
const leaves = [];
for (const r of records) leaves.push(await vendorRecordLeaf(r));
const tree = await buildMerkleTree(leaves, LEVELS);

writeFileSync(
  join(dataDir, "vendors-root.json"),
  JSON.stringify({ root: tree.root.toString(), count: records.length, levels: LEVELS }, null, 2),
);
console.log("vendor registry root:", tree.root.toString());
console.log("saved -> data/vendors.json + data/vendors-root.json");
