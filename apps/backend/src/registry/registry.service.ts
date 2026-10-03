import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

// `new Function` stops the CommonJS build from down-levelling import() to require(),
// which would break these ESM-only packages (snarkjs, circomlibjs-backed zk.mjs, registry).
const importDynamic = new Function("s", "return import(s)") as (s: string) => Promise<any>;

export interface RegistryRecord {
  pan: string;
  kissan: string;
  land: string;
  profession: number; // 0 unknown, 1 farmer, 2 non-farmer
  professionLabel: string;
  income: number;
  name: string;
  phone: string;
  email: string;
  state: string;
  // Education (Post-Matric scholarship) attributes:
  caste: number; // 0 General, 1 SC, 2 ST, 3 OBC, 4 EBC, 5 Minority
  casteLabel: string;
  isStudent: number; // 0/1
  // Housing (PMAY-Gramin) attributes:
  houseStatus: number; // 0 adequate, 1 kutcha, 2 houseless
  houseStatusLabel: string;
  housingExcluded: number; // 0/1
}

export interface EligibilityProof {
  a: string[];
  b: string[][];
  c: string[];
  signals: string[]; // [nullifier, root, schemeId, schemeCategory]
  nullifier: string;
  root: string;
}

/** Thrown when the matched registry record cannot satisfy the eligibility circuit. */
export class IneligibleError extends Error {
  constructor(message = "Not eligible for this scheme under the government registry.") {
    super(message);
    this.name = "IneligibleError";
  }
}

/**
 * Bridge to the fixed government registry + the eligibility zk-SNARK. Loads the
 * committed 10k-record fixture and rebuilds its Poseidon Merkle tree once
 * (cached), matches citizens by document unique id, and produces on-chain-ready
 * Groth16 proofs. Proving fails for ineligible records (the circuit enforces
 * `eligible === 1`), which we surface as IneligibleError.
 */
@Injectable()
export class RegistryService implements OnModuleInit {
  private readonly logger = new Logger(RegistryService.name);
  private records: RegistryRecord[] = [];
  private byPan = new Map<string, number>();
  private tree: unknown;
  private committedRoot = "";
  private zk: any;
  private groth16: any;
  private wasm = "";
  private zkey = "";
  private ready: Promise<void> | null = null;

  async onModuleInit(): Promise<void> {
    // Finish loading before the app starts listening: the tree is precomputed (data/registry-tree.json),
    // so this is ~2s of module import + JSON parse. Serving requests while that synchronous work runs
    // would stall the event loop under them (Postgres handshakes time out → 500s after a cold start).
    this.ready = this.load();
    await this.ready;
  }

  private async load(): Promise<void> {
    const t0 = Date.now();
    const circuitsDir = dirname(require.resolve("@bharatchain/circuits/package.json"));
    this.wasm = join(circuitsDir, "build", "eligibility_js", "eligibility.wasm");
    this.zkey = join(circuitsDir, "build", "eligibility_final.zkey");

    const registry = await importDynamic("@bharatchain/registry");
    this.zk = await importDynamic(pathToFileURL(join(circuitsDir, "src", "zk.mjs")).href);
    const snarkjs = await importDynamic("snarkjs");
    this.groth16 = snarkjs.groth16 ?? snarkjs.default?.groth16;

    this.records = registry.loadRegistry();
    this.committedRoot = registry.loadRegistryRoot().root;
    const { tree } = await registry.buildRegistryTree(this.records);
    this.tree = tree;
    this.records.forEach((r, i) => this.byPan.set(r.pan.toUpperCase(), i));

    this.logger.log(
      `Registry loaded: ${this.records.length} records, root=${this.committedRoot.slice(0, 12)}… in ${Date.now() - t0}ms`,
    );
  }

  private async ensureReady(): Promise<void> {
    if (!this.ready) this.ready = this.load();
    await this.ready;
  }

  /** Await the (one-time) fixture load + tree build. */
  async whenReady(): Promise<void> {
    await this.ensureReady();
  }

  get root(): string {
    return this.committedRoot;
  }

  /** The record at a given fixture index (used after a stored match). */
  async recordAt(index: number): Promise<RegistryRecord> {
    await this.ensureReady();
    return this.records[index];
  }

  /** Find a record by its (case-insensitive) PAN. */
  async findByPan(pan: string): Promise<{ record: RegistryRecord; index: number } | null> {
    await this.ensureReady();
    const index = this.byPan.get(pan.trim().toUpperCase());
    if (index === undefined) return null;
    return { record: this.records[index], index };
  }

  /**
   * Generate an on-chain-ready eligibility proof for a matched record. `schemeCategory` is the
   * scheme's sector (SchemeRegistry.categoryOf) — it selects the in-circuit predicate and is bound
   * to the scheme on-chain. Proving fails (→ IneligibleError) when the record fails that predicate.
   */
  async proveEligibility(index: number, schemeId: number, schemeCategory: number): Promise<EligibilityProof> {
    await this.ensureReady();
    const record = this.records[index];
    const input = await this.zk.buildEligibilityInput(record, this.tree, index, schemeId, schemeCategory);
    let proof: unknown;
    let publicSignals: unknown;
    try {
      ({ proof, publicSignals } = await this.groth16.fullProve(input, this.wasm, this.zkey));
    } catch {
      throw new IneligibleError();
    }
    const calldata: string = await this.groth16.exportSolidityCallData(proof, publicSignals);
    const [a, b, c, signals] = JSON.parse("[" + calldata + "]") as [
      string[],
      string[][],
      string[],
      string[],
    ];
    return { a, b, c, signals, nullifier: signals[0], root: signals[1] };
  }
}
