import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { getAddress } from "ethers";
import { vendorCategoryIndex } from "@bharatchain/shared";
import { Vendor } from "../entities";
import { ChainService } from "../chain/chain.service";
import { SchemesService } from "../schemes/schemes.service";
import { VendorRegistryService } from "../registry/vendor-registry.service";

/**
 * ZK-enrols approved vendors into schemes (the vendor analogue of the citizen enrolment in
 * ApplicationsService). Proves business-registry eligibility (valid licence + a category the scheme
 * allows) and relays the Groth16 proof to VendorZKEnroller. The PaymentRouter requires BOTH the
 * admin VendorRegistry approval AND this per-scheme ZK enrolment before a vendor can be paid.
 */
@Injectable()
export class VendorEnrollmentService {
  private readonly logger = new Logger(VendorEnrollmentService.name);

  constructor(
    @InjectRepository(Vendor) private readonly vendors: Repository<Vendor>,
    private readonly chain: ChainService,
    private readonly schemes: SchemesService,
    private readonly vendorRegistry: VendorRegistryService,
  ) {}

  /** ZK-enrol one approved vendor into one scheme. Idempotent (skips if already enrolled). */
  async enrollVendor(vendorAddressRaw: string, schemeId: number) {
    let vendorAddress: string;
    try {
      vendorAddress = getAddress(vendorAddressRaw);
    } catch {
      throw new BadRequestException("Invalid vendor address.");
    }

    const vendor = await this.vendors.findOne({ where: { address: vendorAddress } });
    if (!vendor) throw new NotFoundException("Vendor not found / not approved.");

    const scheme = await this.schemes.getOne(schemeId); // 404 if unknown
    const requiredCategory = vendorCategoryIndex(vendor.category);
    if (requiredCategory < 0) throw new BadRequestException("Vendor has no valid category.");
    if (!(await this.chain.schemeRegistry.isVendorCategoryAllowed(schemeId, requiredCategory))) {
      throw new BadRequestException(`${scheme.name} does not allow ${vendor.category} vendors.`);
    }

    if (await this.chain.vendorEnrollmentRegistry.isEnrolled(schemeId, vendorAddress)) {
      return { vendorAddress, schemeId, name: vendor.name, enrolled: true, alreadyEnrolled: true };
    }

    const match = await this.vendorRegistry.findByName(vendor.name);
    if (!match) throw new BadRequestException(`${vendor.name} is not in the government business registry.`);

    let proof;
    try {
      proof = await this.vendorRegistry.proveVendorEligibility(match.index, schemeId, requiredCategory);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    let receipt: { hash: string };
    try {
      receipt = await this.chain.runExclusive(async (nonce) => {
        const tx = await this.chain.vendorZkEnroller.enrollVendorWithProof(
          schemeId,
          vendorAddress,
          requiredCategory,
          proof.a,
          proof.b,
          proof.c,
          proof.signals,
          { nonce },
        );
        return tx.wait();
      });
    } catch (err) {
      throw new BadRequestException(
        (err as { shortMessage?: string }).shortMessage ?? "Vendor enrollment reverted on-chain.",
      );
    }

    this.logger.log(`Vendor ${vendor.name} (${vendorAddress}) ZK-enrolled into scheme ${schemeId}`);
    return { vendorAddress, schemeId, name: vendor.name, enrolled: true, txHash: receipt.hash };
  }

  /** ZK-enrol a vendor into every scheme whose allowed categories include its category. */
  async enrollVendorIntoMatchingSchemes(vendorAddressRaw: string) {
    const vendorAddress = getAddress(vendorAddressRaw);
    const vendor = await this.vendors.findOne({ where: { address: vendorAddress } });
    if (!vendor) throw new NotFoundException("Vendor not found.");
    const requiredCategory = vendorCategoryIndex(vendor.category);
    const count = Number(await this.chain.schemeRegistry.schemeCount());
    const results = [];
    for (let schemeId = 0; schemeId < count; schemeId++) {
      if (await this.chain.schemeRegistry.isVendorCategoryAllowed(schemeId, requiredCategory)) {
        results.push(await this.enrollVendor(vendorAddress, schemeId));
      }
    }
    return results;
  }
}
