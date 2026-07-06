// Compiles the BharatChain circuits and produces their Groth16 proving keys + on-chain verifiers.
// Requires the `circom` binary on PATH (snarkjs is an npm dependency).
//
//   npm run zk:build  -w @bharatchain/circuits
//
// Circuits:
//   eligibility        -> citizen enrolment  (Verifier.sol       / contract Groth16Verifier)
//   vendorEligibility  -> vendor  enrolment  (VendorVerifier.sol / contract VendorGroth16Verifier)
//
// Per circuit outputs (in build/):
//   <name>.r1cs, <name>_js/<name>.wasm, <name>_final.zkey, <name>_verification_key.json
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = resolve(here, "..");
const repoRoot = resolve(pkgDir, "../..");
const buildDir = join(pkgDir, "build");
const contractsDir = join(repoRoot, "packages", "contracts", "contracts");

// Powers-of-tau generated LOCALLY with snarkjs (no external download). 2^14 = 16384 domain size,
// comfortably above both circuits. Bump POWER if circom reports more non-linear constraints.
const POWER = 14;
const ptauPath = join(buildDir, `pot${POWER}_final.ptau`);

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: pkgDir });
}

function ensurePtau() {
  if (existsSync(ptauPath)) return;
  const pot0 = join(buildDir, `pot${POWER}_0000.ptau`);
  const pot1 = join(buildDir, `pot${POWER}_0001.ptau`);
  run(`npx snarkjs powersoftau new bn128 ${POWER} "${pot0}" -v`);
  run(`npx snarkjs powersoftau contribute "${pot0}" "${pot1}" --name="bharatchain-dev" -v -e="${Date.now()}-ptau"`);
  run(`npx snarkjs powersoftau prepare phase2 "${pot1}" "${ptauPath}" -v`);
}

/**
 * Build one circuit end-to-end: compile -> groth16 setup + contribution -> export verifier.
 * The generated Solidity verifier is always named `Groth16Verifier`; rename it to
 * `verifierContract` so multiple verifiers can coexist in the contracts package.
 */
function buildCircuit({ name, verifierOut, verifierContract }) {
  const circuit = join(pkgDir, "circuits", `${name}.circom`);
  run(
    `circom "${circuit}" --r1cs --wasm --sym ` +
      `-l "${join(repoRoot, "node_modules")}" -l "${join(pkgDir, "node_modules")}" -o "${buildDir}"`,
  );

  const r1cs = join(buildDir, `${name}.r1cs`);
  const zkey0 = join(buildDir, `${name}_0000.zkey`);
  const zkeyFinal = join(buildDir, `${name}_final.zkey`);
  run(`npx snarkjs groth16 setup "${r1cs}" "${ptauPath}" "${zkey0}"`);
  run(`npx snarkjs zkey contribute "${zkey0}" "${zkeyFinal}" --name="bharatchain-dev" -e="${Date.now()}-entropy"`);
  run(`npx snarkjs zkey export verificationkey "${zkeyFinal}" "${join(buildDir, `${name}_verification_key.json`)}"`);

  const verifierPath = join(contractsDir, verifierOut);
  run(`npx snarkjs zkey export solidityverifier "${zkeyFinal}" "${verifierPath}"`);
  if (verifierContract !== "Groth16Verifier") {
    const src = readFileSync(verifierPath, "utf8").replace(
      /contract\s+Groth16Verifier\b/,
      `contract ${verifierContract}`,
    );
    writeFileSync(verifierPath, src);
  }

  console.log(`  ${name}: verifier -> ${verifierOut} (contract ${verifierContract})`);
  console.log(`  ${name}: zkey     -> ${name}_final.zkey`);
  console.log(`  ${name}: wasm     -> ${name}_js/${name}.wasm`);
}

async function main() {
  mkdirSync(buildDir, { recursive: true });
  ensurePtau();

  buildCircuit({ name: "eligibility", verifierOut: "Verifier.sol", verifierContract: "Groth16Verifier" });
  buildCircuit({ name: "vendorEligibility", verifierOut: "VendorVerifier.sol", verifierContract: "VendorGroth16Verifier" });

  console.log(`\nZK build complete (2 circuits).`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
