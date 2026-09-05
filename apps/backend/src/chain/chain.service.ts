import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Contract, FetchRequest, JsonRpcProvider, Wallet, InterfaceAbi } from "ethers";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

interface DeploymentFile {
  network: string;
  chainId: number;
  operator: string;
  addresses: Record<string, string>;
  abis: Record<string, InterfaceAbi>;
}

export type ContractName =
  | "RoleRegistry"
  | "DigitalRupee"
  | "SchemeRegistry"
  | "VendorRegistry"
  | "BeneficiaryRegistry"
  | "VendorEnrollmentRegistry"
  | "PaymentRouter"
  | "DisbursementController"
  | "RedemptionController"
  | "Groth16Verifier"
  | "ZKEnroller"
  | "VendorGroth16Verifier"
  | "VendorZKEnroller";

/**
 * Single point of contact with the chain. Loads the self-contained deployment
 * bundle (addresses + ABIs) written by the contracts deploy script and exposes
 * contracts bound to the server-side relayer signer — the ONLY operational
 * signer (users are keyless). Contract instances are cached.
 */
@Injectable()
export class ChainService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChainService.name);
  private provider!: JsonRpcProvider;
  private relayer!: Wallet;
  private deployment!: DeploymentFile;
  private readonly cache = new Map<ContractName, Contract>();

  // Relayer transaction serialization. Every write path (disbursal, cron, payments,
  // redemption) shares the ONE relayer wallet, so concurrent sends would collide on
  // the nonce. `runExclusive` queues work and assigns sequential nonces, resyncing
  // from chain after any failure so a bad tx can't poison the rest.
  private txChain: Promise<unknown> = Promise.resolve();
  private nextNonce: number | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const rpc = this.config.get<string>("CHAIN_RPC_URL", "http://127.0.0.1:8545");
    const key = this.config.get<string>("RELAYER_PRIVATE_KEY");
    if (!key) throw new Error("RELAYER_PRIVATE_KEY is not set");

    this.provider = new JsonRpcProvider(this.buildRpcRequest(rpc), undefined, { batchMaxCount: 1 });
    this.relayer = new Wallet(key, this.provider);
    this.deployment = this.loadDeployment();
    this.logger.log(
      `Chain ready: network=${this.deployment.network} relayer=${this.relayer.address}`,
    );
  }

  onModuleDestroy(): void {
    // Stop the provider's polling loop so short-lived contexts (e.g. the seeder) exit cleanly.
    this.provider?.destroy();
  }

  /**
   * Free public RPC endpoints fail intermittently — drpc's free plan answers a
   * perfectly valid single call with HTTP 500 "Temporary internal error. Please
   * retry" (code 19). ethers only auto-retries 429, so one blip would otherwise
   * surface to a citizen as a failed scheme lookup. `processFunc` promotes 5xx
   * into ethers' own throttle/backoff path.
   *
   * Reads only: a 5xx on `eth_sendRawTransaction` is ambiguous (the tx may have
   * landed), and resending would race the managed nonce, so writes still fail
   * fast and let `runExclusive` resync.
   */
  private buildRpcRequest(rpc: string): FetchRequest {
    const req = new FetchRequest(rpc);
    req.timeout = 20_000;
    req.setThrottleParams({ maxAttempts: 5, slotInterval: 300 });
    req.processFunc = async (request, response) => {
      if (response.statusCode >= 500 && response.statusCode < 600) {
        const body = request.body ? new TextDecoder().decode(request.body) : "";
        if (!body.includes("eth_sendRawTransaction")) {
          this.logger.warn(`RPC ${response.statusCode} from ${rpc} — retrying`);
          response.throwThrottleError(`RPC ${response.statusCode}`, 300);
        }
      }
      return response;
    };
    return req;
  }

  private loadDeployment(): DeploymentFile {
    const network = this.config.get<string>("CHAIN_NETWORK", "localhost");
    // Locate packages/contracts/deployments/<network>.json via the package itself.
    const pkg = require.resolve("@bharatchain/contracts/package.json");
    const file = join(dirname(pkg), "deployments", `${network}.json`);
    try {
      return JSON.parse(readFileSync(file, "utf8")) as DeploymentFile;
    } catch {
      throw new Error(
        `Deployment file not found: ${file}. Run 'npm run deploy:local -w @bharatchain/contracts' against a running Hardhat node first.`,
      );
    }
  }

  get relayerAddress(): string {
    return this.relayer.address;
  }

  get rpcProvider(): JsonRpcProvider {
    return this.provider;
  }

  /**
   * Serialize a unit of relayer work and run it with the next managed nonce.
   * `fn` should read any on-chain id it needs, send exactly one relayer tx with
   * the supplied nonce override, await its receipt, and return its result — all
   * under the lock, so ids can't race with concurrent senders. On any error the
   * cached nonce is dropped so the next call resyncs from chain.
   */
  async runExclusive<T>(fn: (nonce: number) => Promise<T>): Promise<T> {
    const run = this.txChain.then(async () => {
      if (this.nextNonce === null) {
        this.nextNonce = await this.provider.getTransactionCount(this.relayer.address, "latest");
      }
      try {
        const result = await fn(this.nextNonce);
        this.nextNonce++;
        return result;
      } catch (err) {
        this.nextNonce = null; // resync from chain on the next call
        throw err;
      }
    });
    // Keep the queue alive regardless of this unit's outcome.
    this.txChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  addressOf(name: ContractName): string {
    const addr = this.deployment.addresses[name];
    if (!addr) throw new Error(`No deployed address for ${name}`);
    return addr;
  }

  /** A relayer-signed contract instance (cached). */
  contract(name: ContractName): Contract {
    const cached = this.cache.get(name);
    if (cached) return cached;
    const abi = this.deployment.abis[name];
    if (!abi) throw new Error(`No ABI for ${name} in deployment bundle`);
    const instance = new Contract(this.addressOf(name), abi, this.relayer);
    this.cache.set(name, instance);
    return instance;
  }

  // Convenience accessors used across the app.
  get schemeRegistry(): Contract {
    return this.contract("SchemeRegistry");
  }
  get vendorRegistry(): Contract {
    return this.contract("VendorRegistry");
  }
  get beneficiaryRegistry(): Contract {
    return this.contract("BeneficiaryRegistry");
  }
  get vendorEnrollmentRegistry(): Contract {
    return this.contract("VendorEnrollmentRegistry");
  }
  get zkEnroller(): Contract {
    return this.contract("ZKEnroller");
  }
  get vendorZkEnroller(): Contract {
    return this.contract("VendorZKEnroller");
  }
  get disbursementController(): Contract {
    return this.contract("DisbursementController");
  }
  get paymentRouter(): Contract {
    return this.contract("PaymentRouter");
  }
  get redemptionController(): Contract {
    return this.contract("RedemptionController");
  }
  get digitalRupee(): Contract {
    return this.contract("DigitalRupee");
  }
}
