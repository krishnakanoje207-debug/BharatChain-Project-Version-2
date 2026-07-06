import { parseEther } from "ethers";
import { SchemeCategory, VendorCategory } from "@bharatchain/shared";

/** ₹n crore expressed in 18-decimal token units (e₹). */
const crore = (n: number) => parseEther(String(n * 1e7));

export interface SeedScheme {
  name: string;
  category: SchemeCategory;
  categoryIndex: number;
  fund: bigint;
  installment: bigint;
  /** Max installments per beneficiary (total entitlement = maxInstallments × installment). */
  maxInstallments: number;
  allowedVendorCategories: number[];
  ministry: string;
  description: string;
}

/** The 3 demo schemes (matches docs/DECISIONS demo defaults). */
export const SEED_SCHEMES: SeedScheme[] = [
  {
    name: "PM-Kisan Samman Nidhi",
    category: SchemeCategory.AGRICULTURE,
    categoryIndex: 0,
    fund: crore(10000),
    installment: parseEther("10000"),
    maxInstallments: 3, // ₹30,000 total per beneficiary
    allowedVendorCategories: [0], // AGRI_INPUT
    ministry: "Ministry of Agriculture & Farmers Welfare",
    description:
      "Income support for eligible farmer families, redeemable at approved agri-input vendors (seeds, fertiliser, equipment).",
  },
  {
    name: "Vidya Lakshmi Scholarship",
    category: SchemeCategory.EDUCATION,
    categoryIndex: 1,
    fund: crore(5000),
    installment: parseEther("50000"),
    maxInstallments: 3, // ₹1,50,000 total per beneficiary
    allowedVendorCategories: [1, 2], // EDU_INSTITUTION, TECH_STORE
    ministry: "Ministry of Education",
    description:
      "Post-Matric scholarship for enrolled students of SC/ST/OBC/EBC/Minority categories whose family income is under their category's ceiling (SC/ST ₹2.5L, OBC ₹1.5L, EBC ₹1L, Minority ₹2L). Redeemable at approved educational institutions and technology stores.",
  },
  {
    name: "PM Awas Yojana",
    category: SchemeCategory.HOUSING,
    categoryIndex: 2,
    fund: crore(8000),
    installment: parseEther("50000"),
    maxInstallments: 3, // ₹1,50,000 total per beneficiary
    allowedVendorCategories: [3], // HOUSING_MATERIAL
    ministry: "Ministry of Housing & Urban Affairs",
    description:
      "PMAY-G housing assistance for houseless or kutcha-dwelling families with annual income under ₹1.8L and no exclusion (income-tax payer, large landholding, government job). Redeemable at approved building-material suppliers.",
  },
];

export interface SeedVendor {
  name: string;
  city: string;
  category: VendorCategory;
  categoryIndex: number;
}

/**
 * Demo institutions — the ONLY pre-approved vendors (real vendors self-register
 * and are admin-approved). Fictional; addresses are derived deterministically
 * from the name at seed time.
 */
export const SEED_VENDORS: SeedVendor[] = [
  { name: "Krishi Seva Kendra", city: "Bhopal", category: VendorCategory.AGRI_INPUT, categoryIndex: 0 },
  { name: "Annapurna Agri Inputs", city: "Nagpur", category: VendorCategory.AGRI_INPUT, categoryIndex: 0 },
  { name: "Bharat Institute of Technology", city: "Indore", category: VendorCategory.EDU_INSTITUTION, categoryIndex: 1 },
  { name: "Saraswati National University", city: "Bhopal", category: VendorCategory.EDU_INSTITUTION, categoryIndex: 1 },
  { name: "DigiBharat Tech Store", city: "Jaipur", category: VendorCategory.TECH_STORE, categoryIndex: 2 },
  { name: "Sharma Electronics & Computers", city: "Nagpur", category: VendorCategory.TECH_STORE, categoryIndex: 2 },
  { name: "Shakti Cement & Building Materials", city: "Raipur", category: VendorCategory.HOUSING_MATERIAL, categoryIndex: 3 },
  { name: "Ambika Steel & Hardware Suppliers", city: "Kanpur", category: VendorCategory.HOUSING_MATERIAL, categoryIndex: 3 },
];
