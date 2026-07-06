/**
 * Idempotent demo seeder. Brings a deployed-but-empty BharatChain to a
 * presentable state:
 *   1. create the 3 demo schemes on-chain (skipped if any exist)
 *   2. commit the citizen registry's Merkle root via ZKEnroller.setRegistryRoot
 *   3. commit the business registry's Merkle root via VendorZKEnroller.setVendorRegistryRoot
 *   4. approve the demo institutions on-chain + mirror them to the vendor cache
 *   5. ZK-enroll each demo institution into the schemes its category may serve
 *   6. sync the scheme cache and attach description/ministry metadata
 *   7. create the demo admin user (for admin-only endpoints)
 *   8. create the demo RBI admin user (for RBI-only redemption endpoints)
 *
 * Prereq: a running chain with contracts deployed (deployments/<network>.json).
 * Run:  npm run seed -w @bharatchain/backend
 */
import { NestFactory } from "@nestjs/core";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { dataSlice, getAddress, id as keccakId } from "ethers";
import * as bcrypt from "bcryptjs";
import { Role } from "@bharatchain/shared";
import { AppModule } from "../app.module";
import { ChainService } from "../chain/chain.service";
import { RegistryService } from "../registry/registry.service";
import { VendorRegistryService } from "../registry/vendor-registry.service";
import { SchemesService } from "../schemes/schemes.service";
import { VendorEnrollmentService } from "../vendors/vendor-enrollment.service";
import { SchemeCache, User, Vendor } from "../entities";
import { SEED_SCHEMES, SEED_VENDORS } from "./seed.data";

/** Deterministic on-chain address for a named demo institution. */
function vendorAddress(name: string): string {
  return getAddress(dataSlice(keccakId(`vendor:${name}`), 12));
}

/** Idempotently create a privileged demo user with the given role. */
async function ensureUser(
  userRepo: Repository<User>,
  opts: { phone: string; password: string; fullName: string; role: Role },
  log: (m: string) => void,
): Promise<void> {
  const existing = await userRepo.findOne({ where: { phone: opts.phone } });
  if (existing) {
    log(`${opts.role} already exists: ${opts.phone}`);
    return;
  }
  let user = userRepo.create({
    phone: opts.phone,
    passwordHash: await bcrypt.hash(opts.password, 10),
    fullName: opts.fullName,
    role: opts.role,
    phoneVerified: true,
  });
  user = await userRepo.save(user);
  user.chainAddress = getAddress(dataSlice(keccakId(user.id), 12));
  await userRepo.save(user);
  log(`${opts.role} created: ${opts.phone} (password from env or default)`);
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["warn", "error"],
  });
  const chain = app.get(ChainService);
  const registry = app.get(RegistryService);
  const vendorRegistry = app.get(VendorRegistryService);
  const vendorEnrollSvc = app.get(VendorEnrollmentService);
  const schemesSvc = app.get(SchemesService);
  const schemeCache = app.get<Repository<SchemeCache>>(getRepositoryToken(SchemeCache));
  const vendorCache = app.get<Repository<Vendor>>(getRepositoryToken(Vendor));
  const userRepo = app.get<Repository<User>>(getRepositoryToken(User));

  await registry.whenReady();
  await vendorRegistry.whenReady();
  let nonce = await chain.rpcProvider.getTransactionCount(chain.relayerAddress, "latest");
  const log = (m: string) => console.log(`  ${m}`);

  // 1) Schemes (on-chain) ----------------------------------------------------
  console.log("[1/8] Schemes");
  const existing = Number(await chain.schemeRegistry.schemeCount());
  if (existing > 0) {
    log(`${existing} scheme(s) already on-chain — skipping creation`);
  } else {
    for (const s of SEED_SCHEMES) {
      const tx = await chain.schemeRegistry.createScheme(
        s.name,
        s.categoryIndex,
        s.fund,
        s.installment,
        s.allowedVendorCategories,
        { nonce: nonce++ },
      );
      await tx.wait();
      log(`created: ${s.name}`);
    }
  }

  // 2) Citizen registry root (on-chain) -------------------------------------
  console.log("[2/8] Citizen registry root");
  const target = BigInt(registry.root);
  const current = BigInt(await chain.zkEnroller.registryRoot());
  if (current === target) {
    log("registry root already committed");
  } else {
    const tx = await chain.zkEnroller.setRegistryRoot(target, { nonce: nonce++ });
    await tx.wait();
    log(`registry root set: ${registry.root.slice(0, 16)}…`);
  }

  // 3) Vendor (business) registry root (on-chain) ---------------------------
  console.log("[3/8] Vendor registry root");
  const vTarget = BigInt(vendorRegistry.root);
  const vCurrent = BigInt(await chain.vendorZkEnroller.vendorRegistryRoot());
  if (vCurrent === vTarget) {
    log("vendor registry root already committed");
  } else {
    const tx = await chain.vendorZkEnroller.setVendorRegistryRoot(vTarget, { nonce: nonce++ });
    await tx.wait();
    log(`vendor registry root set: ${vendorRegistry.root.slice(0, 16)}…`);
  }

  // 4) Demo institutions (vendors) ------------------------------------------
  console.log("[4/8] Demo institutions");
  for (const v of SEED_VENDORS) {
    const address = vendorAddress(v.name);
    if (await chain.vendorRegistry.isApproved(address)) {
      log(`already approved: ${v.name}`);
    } else {
      const tx = await chain.vendorRegistry.approveVendor(address, v.categoryIndex, { nonce: nonce++ });
      await tx.wait();
      log(`approved: ${v.name} (${v.category}) @ ${address.slice(0, 10)}…`);
    }
    await vendorCache.save({
      address,
      name: v.name,
      category: v.category,
      city: v.city,
      approved: true,
    });
  }

  // 5) Vendor ZK enrollment (per-scheme) ------------------------------------
  // Each demo institution proves business-registry eligibility (valid licence + allowed category)
  // and is ZK-enrolled into every scheme its category may serve. PaymentRouter requires this in
  // ADDITION to the admin approval above. Uses the relayer mutex (runExclusive) — must run after
  // all manual-nonce txs above.
  console.log("[5/8] Vendor ZK enrollment");
  for (const v of SEED_VENDORS) {
    const address = vendorAddress(v.name);
    const results = await vendorEnrollSvc.enrollVendorIntoMatchingSchemes(address);
    for (const r of results) {
      log(`${r.alreadyEnrolled ? "already enrolled" : "enrolled"}: ${v.name} → scheme ${r.schemeId}`);
    }
  }

  // 6) Scheme cache metadata -------------------------------------------------
  console.log("[6/8] Scheme cache");
  await schemesSvc.syncCacheFromChain();
  for (let i = 0; i < SEED_SCHEMES.length; i++) {
    const s = SEED_SCHEMES[i];
    const row = await schemeCache.findOne({ where: { schemeId: i } });
    if (row) {
      row.description = s.description;
      row.ministry = s.ministry;
      row.maxInstallments = s.maxInstallments;
      await schemeCache.save(row);
    }
  }
  log(`metadata attached for ${SEED_SCHEMES.length} scheme(s)`);

  // 7) Admin user -----------------------------------------------------------
  console.log("[7/8] Admin user");
  await ensureUser(
    userRepo,
    {
      phone: process.env.ADMIN_PHONE ?? "9000000000",
      password: process.env.ADMIN_PASSWORD ?? "admin12345",
      fullName: "BharatChain Admin",
      role: Role.ADMIN,
    },
    log,
  );

  // 8) RBI admin user -------------------------------------------------------
  console.log("[8/8] RBI admin user");
  await ensureUser(
    userRepo,
    {
      phone: process.env.RBI_PHONE ?? "9000000001",
      password: process.env.RBI_PASSWORD ?? "rbiadmin12345",
      fullName: "BharatChain RBI Admin",
      role: Role.RBI_ADMIN,
    },
    log,
  );

  console.log("\nSeed complete.");
  await app.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
