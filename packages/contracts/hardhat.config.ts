import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import * as path from "path";

// Load the monorepo-root .env so contracts share config with the backend/relayer.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;
const accounts = RELAYER_PRIVATE_KEY ? [RELAYER_PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },
    // Free L2 testnets — fill RPC URLs in .env and fund the relayer from a faucet.
    amoy: {
      url: process.env.AMOY_RPC_URL || "",
      chainId: 80002,
      accounts,
      // Amoy enforces a 25 gwei minimum priority fee; ethers' estimator can land
      // a hair below it (24.999...), so pin a legacy 30 gwei gas price (matches
      // the estimate-gas dry-run cost basis).
      gasPrice: 30_000_000_000,
    },
    arbitrumSepolia: {
      url: process.env.ARBITRUM_SEPOLIA_RPC_URL || "",
      chainId: 421614,
      accounts,
    },
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
  mocha: {
    timeout: 120000, // ZK proof generation takes a few seconds
  },
};

export default config;
