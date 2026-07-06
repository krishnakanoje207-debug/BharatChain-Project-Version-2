// Shared domain types/enums for BharatChain. Imported by backend, indexer, and (later) web.

/** Government-approved vendor categories — gate which scheme funds a vendor can receive. */
export enum VendorCategory {
  AGRI_INPUT = "AGRI_INPUT",
  EDU_INSTITUTION = "EDU_INSTITUTION",
  TECH_STORE = "TECH_STORE",
  HOUSING_MATERIAL = "HOUSING_MATERIAL",
}

/** Scheme sector/category — used to group schemes on the "Government Schemes" browse page. */
export enum SchemeCategory {
  AGRICULTURE = "AGRICULTURE",
  EDUCATION = "EDUCATION",
  HOUSING = "HOUSING",
  HEALTH = "HEALTH",
  EMPLOYMENT = "EMPLOYMENT",
  SOCIAL_WELFARE = "SOCIAL_WELFARE",
}

/**
 * Social category — drives the caste-specific income ceiling for education
 * scholarships (mirrors the National Scholarship Portal Post-Matric scheme).
 * The numeric code is what the eligibility circuit reads (uint order below).
 */
export enum Caste {
  GENERAL = "GENERAL",
  SC = "SC",
  ST = "ST",
  OBC = "OBC",
  EBC = "EBC",
  MINORITY = "MINORITY",
}

/** Circuit uint ordering for {@link Caste} — must match eligibility.circom. */
export const CASTE_BY_INDEX: Caste[] = [
  Caste.GENERAL,
  Caste.SC,
  Caste.ST,
  Caste.OBC,
  Caste.EBC,
  Caste.MINORITY,
];

/** Per-category annual family-income ceiling (₹) for the Post-Matric scholarship. */
export const EDUCATION_INCOME_CAP: Record<Caste, number> = {
  [Caste.GENERAL]: 0, // General category is not covered by the Post-Matric scholarship.
  [Caste.SC]: 250000,
  [Caste.ST]: 250000,
  [Caste.OBC]: 150000,
  [Caste.EBC]: 100000,
  [Caste.MINORITY]: 200000,
};

/**
 * Housing condition — drives PMAY-Gramin eligibility (houseless or kutcha
 * dwellings qualify; an adequate pucca house does not). Numeric code matches
 * the eligibility circuit uint ordering.
 */
export enum HouseStatus {
  ADEQUATE = "ADEQUATE", // owns a pucca/adequate house — not eligible
  KUTCHA = "KUTCHA", // kutcha/deteriorating walls & roof — eligible
  HOUSELESS = "HOUSELESS", // no house at all — eligible (priority)
}

/** Circuit uint ordering for {@link HouseStatus} — must match eligibility.circom. */
export const HOUSE_STATUS_BY_INDEX: HouseStatus[] = [
  HouseStatus.ADEQUATE,
  HouseStatus.KUTCHA,
  HouseStatus.HOUSELESS,
];

/** PMAY-Gramin annual-income exclusion line (₹15,000/month). */
export const HOUSING_INCOME_CAP = 180000;

/** Access roles across the four surfaces (public site, token app, admin, RBI). */
export enum Role {
  CITIZEN = "CITIZEN",
  VENDOR = "VENDOR",
  ADMIN = "ADMIN",
  RBI_ADMIN = "RBI_ADMIN",
}

export enum ApplicationStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

/** Lifecycle of a citizen→vendor payment (redemption only draws from DELIVERED). */
export enum PaymentStatus {
  PAID = "PAID",
  DELIVERED = "DELIVERED",
  REDEEMED = "REDEEMED",
}

/** Lifecycle of a vendor's e₹→fiat redemption request (RBI-approved). */
export enum RedemptionStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

/** Fraud/anomaly signal types surfaced to admin/RBI dashboards (Kafka-fed). */
export enum AnomalyType {
  /** One vendor receiving payments from abnormally many distinct citizens. */
  FAN_IN = "FAN_IN",
  /** A burst of payments to one vendor in a short window. */
  VELOCITY = "VELOCITY",
  /** Citizen paying themselves / a vendor tied to their own identity. */
  SELF_DEAL = "SELF_DEAL",
}

export enum AnomalyStatus {
  OPEN = "OPEN",
  RESOLVED = "RESOLVED",
}

/** Which vendor categories a scheme of a given sector is allowed to pay. */
export const SCHEME_ALLOWED_VENDOR_CATEGORIES: Record<SchemeCategory, VendorCategory[]> = {
  [SchemeCategory.AGRICULTURE]: [VendorCategory.AGRI_INPUT],
  [SchemeCategory.EDUCATION]: [VendorCategory.EDU_INSTITUTION, VendorCategory.TECH_STORE],
  [SchemeCategory.HOUSING]: [VendorCategory.HOUSING_MATERIAL],
  [SchemeCategory.HEALTH]: [],
  [SchemeCategory.EMPLOYMENT]: [],
  [SchemeCategory.SOCIAL_WELFARE]: [],
};

/** On-chain `category` (uint8) ordering for vendors — must match the Solidity/seed enum order. */
export const VENDOR_CATEGORY_BY_INDEX: VendorCategory[] = [
  VendorCategory.AGRI_INPUT,
  VendorCategory.EDU_INSTITUTION,
  VendorCategory.TECH_STORE,
  VendorCategory.HOUSING_MATERIAL,
];

export function vendorCategoryIndex(category: VendorCategory): number {
  return VENDOR_CATEGORY_BY_INDEX.indexOf(category);
}
