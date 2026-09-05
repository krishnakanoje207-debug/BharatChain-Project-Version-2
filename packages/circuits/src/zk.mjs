// JS-side tooling for the eligibility circuit: Poseidon hashing, the registry Merkle tree, and
// circuit-input construction. Uses the SAME Poseidon as circomlib so the JS root matches the circuit.
import { buildPoseidon } from "circomlibjs";

let _poseidon;
export async function getPoseidon() {
  if (!_poseidon) _poseidon = await buildPoseidon();
  return _poseidon;
}

/**
 * Poseidon hashing is synchronous CPU work, and `await` on an already-resolved value only drains
 * the microtask queue — a long hashing loop therefore starves the event loop completely. Callers
 * yield a real macrotask every few hundred hashes so pending I/O (e.g. the Postgres TLS/SCRAM
 * handshake, which the server aborts with "Authentication timed out") can still make progress.
 */
export const yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve));

export const Profession = { UNKNOWN: 0, FARMER: 1, NON_FARMER: 2 };

/** Encode a document-id string/number to a field element (big-endian bytes as BigInt). */
export function encodeId(value) {
  if (value === undefined || value === null || value === "") return 0n;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  let acc = 0n;
  for (const b of Buffer.from(String(value), "utf8")) acc = (acc << 8n) + BigInt(b);
  return acc;
}

/**
 * Registry leaf = Poseidon(pan, kissan, land, profession, income,
 *                          isStudent, caste, houseStatus, housingExcluded).
 * The last four fields are private circuit inputs that drive the education
 * (student + caste-specific income cap) and housing (PMAY-G) predicates. They
 * are hashed into the leaf so a citizen cannot forge an attribute they lack.
 */
export async function recordLeaf(record) {
  const p = await getPoseidon();
  return p.F.toObject(
    p([
      encodeId(record.pan),
      encodeId(record.kissan),
      encodeId(record.land),
      BigInt(record.profession ?? 0),
      BigInt(record.income ?? 0),
      BigInt(record.isStudent ?? 0),
      BigInt(record.caste ?? 0),
      BigInt(record.houseStatus ?? 0),
      BigInt(record.housingExcluded ?? 0),
    ]),
  );
}

/** Build a fixed-depth Merkle tree over `leaves` (BigInt[]) using zero-hashes for empty siblings. */
export async function buildMerkleTree(leaves, levels = 16) {
  const p = await getPoseidon();
  const hp = (a, b) => p.F.toObject(p([a, b]));

  const zeros = [0n];
  for (let l = 1; l <= levels; l++) zeros.push(hp(zeros[l - 1], zeros[l - 1]));

  const layers = [leaves.slice()];
  for (let l = 0; l < levels; l++) {
    const prev = layers[l];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      const left = prev[i];
      const right = i + 1 < prev.length ? prev[i + 1] : zeros[l];
      next.push(hp(left, right));
      if (next.length % 256 === 0) await yieldToEventLoop();
    }
    if (next.length === 0) next.push(zeros[l + 1]);
    layers.push(next);
  }
  return { root: layers[levels][0], layers, levels, zeros };
}

/** Merkle proof for a leaf index: { pathElements, pathIndices } (pathIndices[i]=1 => current is right). */
export function getMerkleProof(tree, index) {
  const pathElements = [];
  const pathIndices = [];
  let idx = index;
  for (let l = 0; l < tree.levels; l++) {
    const layer = tree.layers[l];
    const isRight = idx & 1;
    const sibling = isRight ? layer[idx - 1] : idx + 1 < layer.length ? layer[idx + 1] : tree.zeros[l];
    pathElements.push(sibling);
    pathIndices.push(isRight ? 1 : 0);
    idx = idx >> 1;
  }
  return { pathElements, pathIndices };
}

/**
 * Full circuit input object (all values stringified) for `record` at `index` in `tree`.
 * `schemeCategory` is the scheme's sector (0 agri | 1 education | 2 housing) and selects the
 * eligibility predicate the circuit enforces.
 */
export async function buildEligibilityInput(record, tree, index, schemeId, schemeCategory = 0) {
  const { pathElements, pathIndices } = getMerkleProof(tree, index);
  return {
    pan: encodeId(record.pan).toString(),
    kissan: encodeId(record.kissan).toString(),
    land: encodeId(record.land).toString(),
    profession: BigInt(record.profession ?? 0).toString(),
    income: BigInt(record.income ?? 0).toString(),
    isStudent: BigInt(record.isStudent ?? 0).toString(),
    caste: BigInt(record.caste ?? 0).toString(),
    houseStatus: BigInt(record.houseStatus ?? 0).toString(),
    housingExcluded: BigInt(record.housingExcluded ?? 0).toString(),
    pathElements: pathElements.map((x) => x.toString()),
    pathIndices: pathIndices.map((x) => x.toString()),
    root: tree.root.toString(),
    schemeId: BigInt(schemeId).toString(),
    schemeCategory: BigInt(schemeCategory).toString(),
  };
}

/** Convenience: nullifier = Poseidon(pan, schemeId) (matches the circuit output). */
export async function computeNullifier(pan, schemeId) {
  const p = await getPoseidon();
  return p.F.toObject(p([encodeId(pan), BigInt(schemeId)]));
}

// --- Vendor eligibility (symmetric to the citizen eligibility helpers above) ---

/** Business-registry leaf = Poseidon(businessId, category, licenseValid). */
export async function vendorRecordLeaf(record) {
  const p = await getPoseidon();
  return p.F.toObject(
    p([
      encodeId(record.businessId ?? record.gst),
      BigInt(record.category ?? 0),
      BigInt(record.licenseValid ? 1 : 0),
    ]),
  );
}

/** Full vendor-circuit input object (all values stringified) for `record` at `index` in `tree`. */
export async function buildVendorEligibilityInput(record, tree, index, schemeId, requiredCategory) {
  const { pathElements, pathIndices } = getMerkleProof(tree, index);
  return {
    businessId: encodeId(record.businessId ?? record.gst).toString(),
    category: BigInt(record.category ?? 0).toString(),
    licenseValid: BigInt(record.licenseValid ? 1 : 0).toString(),
    pathElements: pathElements.map((x) => x.toString()),
    pathIndices: pathIndices.map((x) => x.toString()),
    root: tree.root.toString(),
    schemeId: BigInt(schemeId).toString(),
    requiredCategory: BigInt(requiredCategory).toString(),
  };
}

/** Convenience: vendor nullifier = Poseidon(businessId, schemeId) (matches the circuit output). */
export async function computeVendorNullifier(businessId, schemeId) {
  const p = await getPoseidon();
  return p.F.toObject(p([encodeId(businessId), BigInt(schemeId)]));
}
