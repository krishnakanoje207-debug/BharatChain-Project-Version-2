import { ethers } from "hardhat";

/**
 * Dry-run the full deploy on the in-memory network and report total gas —
 * used to size faucet funds before a real testnet deploy (gas is EVM-identical).
 * Run: npx hardhat run scripts/estimate-gas.ts
 */
async function main() {
  const startBlock = await ethers.provider.getBlockNumber();

  // Reuse the real deploy script wholesale so the measurement can't drift.
  // deploy.ts starts its async main() at import time; wait until the chain
  // stops producing blocks to know it finished.
  await import("./deploy");
  let last = -1;
  let stableFor = 0;
  while (stableFor < 3000) {
    await new Promise((r) => setTimeout(r, 500));
    const now = await ethers.provider.getBlockNumber();
    stableFor = now === last ? stableFor + 500 : 0;
    last = now;
  }

  let totalGas = 0n;
  for (let b = startBlock + 1; b <= last; b++) {
    totalGas += (await ethers.provider.getBlock(b))?.gasUsed ?? 0n;
  }
  console.log(`\nTotal deploy gas: ${totalGas} (${(Number(totalGas) / 1e6).toFixed(2)}M) across ${last - startBlock} txs`);
  for (const gwei of [25, 30, 50]) {
    console.log(`  @ ${gwei} gwei: ${ethers.formatEther(totalGas * BigInt(gwei) * 10n ** 9n)} POL`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
