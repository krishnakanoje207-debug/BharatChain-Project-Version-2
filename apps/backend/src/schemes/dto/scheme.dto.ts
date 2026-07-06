import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { SchemeCategory, VendorCategory } from "@bharatchain/shared";

/**
 * Sectors the eligibility circuit can actually prove (predicates 0–2 in
 * eligibility.circom). HEALTH/EMPLOYMENT/SOCIAL_WELFARE have no predicate yet —
 * a scheme created there would reject every applicant, so creation is blocked
 * until their circuits ship.
 */
export const PROVABLE_SCHEME_CATEGORIES = [
  SchemeCategory.AGRICULTURE,
  SchemeCategory.EDUCATION,
  SchemeCategory.HOUSING,
] as const;

/** Admin: create a new welfare scheme (on-chain + off-chain metadata). */
export class CreateSchemeDto {
  @IsString() @MinLength(3) @MaxLength(120) name!: string;

  @IsIn(PROVABLE_SCHEME_CATEGORIES, {
    message: "category must be a sector with a live eligibility circuit (AGRICULTURE, EDUCATION or HOUSING)",
  })
  category!: keyof typeof SchemeCategory;

  /** Total allotted fund, in whole rupees of e₹ (e.g. "100000000" = ₹10 crore). */
  @IsNumberString() fundRupees!: string;

  /** Per-beneficiary installment, in whole rupees of e₹. */
  @IsNumberString() installmentRupees!: string;

  @IsOptional() @IsInt() @Min(1) @Max(12) maxInstallments?: number;

  /** Vendor categories this scheme's e₹ may be spent at. */
  @IsArray() @ArrayNotEmpty() @IsIn(Object.keys(VendorCategory), { each: true })
  allowedVendorCategories!: (keyof typeof VendorCategory)[];

  @IsOptional() @IsString() @MaxLength(160) ministry?: string;
  @IsOptional() @IsString() @MaxLength(600) description?: string;
}

/**
 * Admin: modify a scheme. Eligibility, category and installment are immutable
 * once enrolees exist — only the active flag, the fund ceiling (top-up) and the
 * off-chain metadata can change.
 */
export class UpdateSchemeDto {
  @IsOptional() @IsBoolean() active?: boolean;
  /** Amount to add to the scheme fund, in whole rupees of e₹. */
  @IsOptional() @IsNumberString() topUpRupees?: string;
  @IsOptional() @IsInt() @Min(1) @Max(12) maxInstallments?: number;
  @IsOptional() @IsString() @MaxLength(160) ministry?: string;
  @IsOptional() @IsString() @MaxLength(600) description?: string;
}
