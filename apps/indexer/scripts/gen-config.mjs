// Generate the subgraph's networks.json + abis/*.json from the contracts deployment
// bundle (addresses + ABIs) written by `npm run deploy:local -w @bharatchain/contracts`.
// Keeps the subgraph in lock-step with whatever is currently deployed.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const indexerDir = resolve(here, "..");
const network = process.env.CHAIN_NETWORK || "localhost";
const deploymentFile = resolve(indexerDir, "..", "..", "packages", "contracts", "deployments", `${network}.json`);

// The contracts whose events the subgraph indexes (must match dataSource names in subgraph.yaml).
const CONTRACTS = [
  "SchemeRegistry",
  "ZKEnroller",
  "DisbursementController",
  "PaymentRouter",
  "VendorRegistry",
  "RedemptionController",
];

if (!existsSync(deploymentFile)) {
  console.error(
    `Deployment not found: ${deploymentFile}\nRun 'npm run deploy:local -w @bharatchain/contracts' against a running Hardhat node first.`,
  );
  process.exit(1);
}

const deployment = JSON.parse(readFileSync(deploymentFile, "utf8"));
const startBlock = Number(process.env.SUBGRAPH_START_BLOCK || 0);

// networks.json — graph build --network hardhat injects these addresses.
const networks = { hardhat: {} };
const abisDir = join(indexerDir, "abis");
mkdirSync(abisDir, { recursive: true });

for (const name of CONTRACTS) {
  const address = deployment.addresses[name];
  const abi = deployment.abis[name];
  if (!address || !abi) {
    console.error(`Missing ${name} in deployment bundle (address or abi).`);
    process.exit(1);
  }
  networks.hardhat[name] = { address, startBlock };
  writeFileSync(join(abisDir, `${name}.json`), JSON.stringify(abi, null, 2));
}

writeFileSync(join(indexerDir, "networks.json"), JSON.stringify(networks, null, 2));
console.log(`Wrote networks.json + ${CONTRACTS.length} ABIs for network "${network}" (startBlock ${startBlock}).`);
for (const name of CONTRACTS) console.log(`  ${name} @ ${networks.hardhat[name].address}`);
