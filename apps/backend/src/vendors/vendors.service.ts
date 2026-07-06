import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { VENDOR_CATEGORY_BY_INDEX, VendorCategory } from "@bharatchain/shared";
import { Vendor } from "../entities";
import { ChainService } from "../chain/chain.service";
import { SchemesService } from "../schemes/schemes.service";

export interface VendorView {
  address: string;
  name: string;
  category: VendorCategory;
  city?: string;
}

@Injectable()
export class VendorsService {
  constructor(
    @InjectRepository(Vendor) private readonly vendors: Repository<Vendor>,
    private readonly chain: ChainService,
    private readonly schemes: SchemesService,
  ) {}

  /** All approved vendors (optionally filtered by category). */
  async list(category?: VendorCategory): Promise<VendorView[]> {
    const where = { approved: true, ...(category ? { category } : {}) };
    const rows = await this.vendors.find({ where, order: { name: "ASC" } });
    return rows.map((v) => ({ address: v.address, name: v.name, category: v.category, city: v.city }));
  }

  /**
   * Vendors a citizen may actually pay from a given scheme — the same two gates
   * the PaymentRouter enforces: the vendor's category must be in the scheme's
   * on-chain allow-list (NOT the static sector default — admin-created schemes
   * can differ), and the vendor must be ZK-enrolled into this scheme.
   */
  async listForScheme(schemeId: number): Promise<VendorView[]> {
    await this.schemes.getOne(schemeId); // 404 if unknown

    const allowed: VendorCategory[] = [];
    for (let idx = 0; idx < VENDOR_CATEGORY_BY_INDEX.length; idx++) {
      if (await this.chain.schemeRegistry.isVendorCategoryAllowed(schemeId, idx)) {
        allowed.push(VENDOR_CATEGORY_BY_INDEX[idx]);
      }
    }
    if (allowed.length === 0) return [];

    const rows = await this.vendors.find({
      where: { approved: true, category: In(allowed) },
      order: { name: "ASC" },
    });
    const enrolled = await Promise.all(
      rows.map((v) => this.chain.vendorEnrollmentRegistry.isEnrolled(schemeId, v.address) as Promise<boolean>),
    );
    return rows
      .filter((_, i) => enrolled[i])
      .map((v) => ({ address: v.address, name: v.name, category: v.category, city: v.city }));
  }
}
