import { VendorView, SchemeView, PublicUser } from "../../lib/api";

/** Which scheme sectors a vendor category may receive funds from. */
export const VENDOR_SERVES: Record<string, string[]> = {
  AGRI_INPUT: ["AGRICULTURE"],
  EDU_INSTITUTION: ["EDUCATION"],
  TECH_STORE: ["EDUCATION"],
  HOUSING_MATERIAL: ["HOUSING"],
};

/** Find the logged-in vendor's own registry record by matching their chain address. */
export function findSelf(user: PublicUser | null, vendors: VendorView[]): VendorView | undefined {
  if (!user?.chainAddress) return undefined;
  const a = user.chainAddress.toLowerCase();
  return vendors.find((v) => v.address.toLowerCase() === a);
}

export function serveableSchemes(category: string | undefined, schemes: SchemeView[]): SchemeView[] {
  if (!category) return [];
  const sectors = VENDOR_SERVES[category] ?? [];
  return schemes.filter((s) => sectors.includes(s.category) && s.active);
}
