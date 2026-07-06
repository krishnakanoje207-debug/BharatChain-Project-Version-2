import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { formatEther, parseEther } from "ethers";
import { SchemeCategory, VendorCategory } from "@bharatchain/shared";
import { SchemeCache } from "../entities";
import { ChainService } from "../chain/chain.service";
import { CreateSchemeDto, UpdateSchemeDto } from "./dto/scheme.dto";

/** On-chain `category` (uint8) ordering — must match the Solidity/shared enum order. */
const CATEGORY_BY_INDEX: SchemeCategory[] = [
  SchemeCategory.AGRICULTURE,
  SchemeCategory.EDUCATION,
  SchemeCategory.HOUSING,
  SchemeCategory.HEALTH,
  SchemeCategory.EMPLOYMENT,
  SchemeCategory.SOCIAL_WELFARE,
];

/** On-chain vendor-category (uint8) ordering — must match the seed/contract order. */
const VENDOR_CATEGORY_BY_INDEX: VendorCategory[] = [
  VendorCategory.AGRI_INPUT,
  VendorCategory.EDU_INSTITUTION,
  VendorCategory.TECH_STORE,
  VendorCategory.HOUSING_MATERIAL,
];

export function categoryIndex(category: SchemeCategory): number {
  return CATEGORY_BY_INDEX.indexOf(category);
}

export function vendorCategoryIndex(category: VendorCategory): number {
  return VENDOR_CATEGORY_BY_INDEX.indexOf(category);
}

export interface SchemeView {
  schemeId: number;
  name: string;
  category: SchemeCategory;
  description?: string;
  ministry?: string;
  active: boolean;
  fund: string;
  disbursed: string;
  remaining: string;
  installmentAmount: string;
  maxInstallments: number;
  fundFormatted: string;
  remainingFormatted: string;
  installmentFormatted: string;
}

export interface SchemeCategoryGroup {
  category: SchemeCategory;
  schemes: SchemeView[];
}

@Injectable()
export class SchemesService {
  private readonly logger = new Logger(SchemesService.name);

  constructor(
    @InjectRepository(SchemeCache) private readonly cache: Repository<SchemeCache>,
    private readonly chain: ChainService,
  ) {}

  /** Read every scheme from chain and enrich with cached off-chain metadata. */
  async listFromChain(): Promise<SchemeView[]> {
    const count = Number(await this.chain.schemeRegistry.schemeCount());
    const meta = new Map((await this.cache.find()).map((c) => [c.schemeId, c]));
    const out: SchemeView[] = [];
    for (let id = 0; id < count; id++) {
      const s = await this.chain.schemeRegistry.getScheme(id);
      out.push(this.toView(id, s, meta.get(id)));
    }
    return out;
  }

  async getOne(schemeId: number): Promise<SchemeView> {
    const count = Number(await this.chain.schemeRegistry.schemeCount());
    if (schemeId < 0 || schemeId >= count) throw new NotFoundException("Unknown scheme");
    const s = await this.chain.schemeRegistry.getScheme(schemeId);
    const meta = (await this.cache.findOne({ where: { schemeId } })) ?? undefined;
    return this.toView(schemeId, s, meta);
  }

  /**
   * Public "Government Schemes" browse: active schemes grouped by category,
   * with optional free-text search and category filter (india.gov.in style).
   */
  async browse(opts: { q?: string; category?: SchemeCategory; includeInactive?: boolean } = {}): Promise<SchemeCategoryGroup[]> {
    const q = opts.q?.trim().toLowerCase();
    let schemes = await this.listFromChain();
    if (!opts.includeInactive) schemes = schemes.filter((s) => s.active);
    if (opts.category) schemes = schemes.filter((s) => s.category === opts.category);
    if (q) {
      schemes = schemes.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.description?.toLowerCase().includes(q) ?? false),
      );
    }
    const groups = new Map<SchemeCategory, SchemeView[]>();
    for (const s of schemes) {
      (groups.get(s.category) ?? groups.set(s.category, []).get(s.category)!).push(s);
    }
    // Stable category ordering.
    return CATEGORY_BY_INDEX.filter((c) => groups.has(c)).map((category) => ({
      category,
      schemes: groups.get(category)!,
    }));
  }

  /** Upsert the off-chain cache from chain, preserving seeded description/ministry. */
  async syncCacheFromChain(): Promise<number> {
    const schemes = await this.listFromChain();
    for (const s of schemes) {
      const existing = await this.cache.findOne({ where: { schemeId: s.schemeId } });
      await this.cache.save({
        schemeId: s.schemeId,
        name: s.name,
        category: s.category,
        fund: s.fund,
        installmentAmount: s.installmentAmount,
        disbursed: s.disbursed,
        active: s.active,
        description: existing?.description,
        ministry: existing?.ministry,
        maxInstallments: existing?.maxInstallments ?? 3,
      });
    }
    this.logger.log(`Synced ${schemes.length} scheme(s) to cache`);
    return schemes.length;
  }

  /** Admin: create a new scheme on-chain (relayer) + persist its off-chain metadata. */
  async create(dto: CreateSchemeDto): Promise<SchemeView> {
    const category = SchemeCategory[dto.category];
    const catIdx = categoryIndex(category);
    const vendorCatIdx = dto.allowedVendorCategories.map((c) => vendorCategoryIndex(VendorCategory[c]));
    const fund = parseEther(dto.fundRupees);
    const installment = parseEther(dto.installmentRupees);

    const schemeId = await this.chain.runExclusive(async (nonce) => {
      const tx = await this.chain.schemeRegistry.createScheme(dto.name, catIdx, fund, installment, vendorCatIdx, { nonce });
      await tx.wait();
      return Number(await this.chain.schemeRegistry.schemeCount()) - 1;
    });

    await this.cache.save({
      schemeId,
      name: dto.name,
      category,
      fund: fund.toString(),
      installmentAmount: installment.toString(),
      disbursed: "0",
      active: true,
      description: dto.description,
      ministry: dto.ministry,
      maxInstallments: dto.maxInstallments ?? 3,
    });
    this.logger.log(`Created scheme #${schemeId} "${dto.name}"`);
    return this.getOne(schemeId);
  }

  /**
   * Admin: modify a scheme. Active flag + fund top-up go on-chain (relayer);
   * description/ministry/maxInstallments are off-chain metadata. Eligibility,
   * category and installment are immutable once the scheme has enrolees.
   */
  async update(schemeId: number, dto: UpdateSchemeDto): Promise<SchemeView> {
    await this.getOne(schemeId); // 404 if unknown

    if (dto.active !== undefined) {
      const active = dto.active;
      await this.chain.runExclusive(async (nonce) => {
        const tx = await this.chain.schemeRegistry.setActive(schemeId, active, { nonce });
        return tx.wait();
      });
    }
    if (dto.topUpRupees) {
      const amount = parseEther(dto.topUpRupees);
      await this.chain.runExclusive(async (nonce) => {
        const tx = await this.chain.schemeRegistry.topUpFund(schemeId, amount, { nonce });
        return tx.wait();
      });
    }

    const existing = await this.cache.findOne({ where: { schemeId } });
    if (existing) {
      if (dto.description !== undefined) existing.description = dto.description;
      if (dto.ministry !== undefined) existing.ministry = dto.ministry;
      if (dto.maxInstallments !== undefined) existing.maxInstallments = dto.maxInstallments;
      existing.active = (await this.getOne(schemeId)).active;
      await this.cache.save(existing);
    }
    this.logger.log(`Updated scheme #${schemeId}`);
    return this.getOne(schemeId);
  }

  private toView(
    id: number,
    s: { name: string; category: bigint; fund: bigint; installmentAmount: bigint; disbursed: bigint; active: boolean },
    meta?: SchemeCache,
  ): SchemeView {
    const fund = s.fund;
    const disbursed = s.disbursed;
    const remaining = fund - disbursed;
    return {
      schemeId: id,
      name: s.name,
      category: CATEGORY_BY_INDEX[Number(s.category)] ?? SchemeCategory.SOCIAL_WELFARE,
      description: meta?.description,
      ministry: meta?.ministry,
      active: s.active,
      fund: fund.toString(),
      disbursed: disbursed.toString(),
      remaining: remaining.toString(),
      installmentAmount: s.installmentAmount.toString(),
      maxInstallments: meta?.maxInstallments ?? 3,
      fundFormatted: formatEther(fund),
      remainingFormatted: formatEther(remaining),
      installmentFormatted: formatEther(s.installmentAmount),
    };
  }
}
