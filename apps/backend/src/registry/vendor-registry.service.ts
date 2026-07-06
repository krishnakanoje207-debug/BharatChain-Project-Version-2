import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

// `new Function` stops the CommonJS build from down-levelling import() to require(),
// which would break these ESM-only packages (snarkjs, circomlibjs-backed zk.mjs, vendor-registry).
const importDynamic = new Function("s", "return import(s)") as (s: string) => Promise<any>;

export interface VendorRecord {
  businessId: string;
  name: string;
  category: number; // VendorCategory uint8 (0..3)
  categoryLabel: string;
  licenseValid: number; // 1 valid, 0 lapsed
  city: string;
}

export interface VendorEligibilityProof {
  a: string[];
  b: string[][];
  c: string[];
  signals: string[]; // [nullifier, root, schemeId, requiredCategory]
  nullifier: string;
  root: string;
}

/** Thrown when the matched business record cannot satisfy the vendor eligibility circuit. */
export class VendorIneligibleError extends Error {
  constructor(message = "Business not eligible (lapsed licence or category mismatch) under the registry.") {
    super(message);
    this.name = "VendorIneligibleError";
  }
}

/**
 * Bridge to the fixed government business registry + the vendor eligibility zk-SNARK (symmetric to
 * RegistryService). Loads the committed business fixture, rebuilds its Poseidon Merkle tree once
 * (cached), matches businesses by name/id, and produces on-chain-ready Groth16 proofs. Proving fails
 * for ineligible records (the circuit enforces licenseValid === 1 and category === requiredCategory).
 */
@Injectable()
export class VendorRegistryService implements OnModuleInit {
  private readonly logger = new Logger(VendorRegistryService.name);
  private records: VendorRecord[] = [];
  private byName = new Map<string, number>();
  private tree: unknown;
  private committedRoot = "";
  private zk: any;
  private groth16: any;
  private wasm = "";
  private zkey = "";
  private ready: Promise<void> | null = null;

  onModuleInit(): void {
    this.ready = this.load();
  }

  private async load(): Promise<void> {
    const t0 = Date.now();
    const circuitsDir = dirname(require.resolve("@bharatchain/circuits/package.json"));
    this.wasm = join(circuitsDir, "build", "vendorEligibility_js", "vendorEligibility.wasm");
    this.zkey = join(circuitsDir, "build", "vendorEligibility_final.zkey");

    const registry = await importDynamic("@bharatchain/vendor-registry");
    this.zk = await importDynamic(pathToFileURL(join(circuitsDir, "src", "zk.mjs")).href);
    const snarkjs = await importDynamic("snarkjs");
    this.groth16 = snarkjs.groth16 ?? snarkjs.default?.groth16;

    this.records = registry.loadVendorRegistry();
    this.committedRoot = registry.loadVendorRegistryRoot().root;
    const { tree } = await registry.buildVendorRegistryTree(this.records);
    this.tree = tree;
    this.records.forEach((r, i) => this.byName.set(r.name.toLowerCase(), i));

    this.logger.log(
      `Vendor registry loaded: ${this.records.length} businesses, root=${this.committedRoot.slice(0, 12)}… in ${Date.now() - t0}ms`,
    );
  }

  private async ensureReady(): Promise<void> {
    if (!this.ready) this.ready = this.load();
    await this.ready;
  }

  async whenReady(): Promise<void> {
    await this.ensureReady();
  }

  get root(): string {
    return this.committedRoot;
  }

  /** Find a business record by its (case-insensitive) registered name. */
  async findByName(name: string): Promise<{ record: VendorRecord; index: number } | null> {
    await this.ensureReady();
    const index = this.byName.get(name.trim().toLowerCase());
    if (index === undefined) return null;
    return { record: this.records[index], index };
  }

  /** Generate an on-chain-ready vendor eligibility proof for a matched business record. */
  async proveVendorEligibility(
    index: number,
    schemeId: number,
    requiredCategory: number,
  ): Promise<VendorEligibilityProof> {
    await this.ensureReady();
    const record = this.records[index];
    const input = await this.zk.buildVendorEligibilityInput(record, this.tree, index, schemeId, requiredCategory);
    let proof: unknown;
    let publicSignals: unknown;
    try {
      ({ proof, publicSignals } = await this.groth16.fullProve(input, this.wasm, this.zkey));
    } catch {
      throw new VendorIneligibleError();
    }
    const calldata: string = await this.groth16.exportSolidityCallData(proof, publicSignals);
    const [a, b, c, signals] = JSON.parse("[" + calldata + "]") as [string[], string[][], string[], string[]];
    return { a, b, c, signals, nullifier: signals[0], root: signals[1] };
  }
}
