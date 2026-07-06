// Formatting + domain label helpers shared across every surface.

/** Format a rupee amount with Indian digit grouping (e.g. 12,48,000). */
export function inr(amount: number, opts: { paise?: boolean } = {}): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return "₹" + n.toLocaleString("en-IN", {
    maximumFractionDigits: opts.paise ? 2 : 0,
    minimumFractionDigits: 0,
  });
}

/** Compact rupee for big sums: ₹2,340 Cr / ₹4.6 L / ₹12,400. */
export function inrCompact(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  if (n >= 1e7) return "₹" + (n / 1e7).toLocaleString("en-IN", { maximumFractionDigits: n >= 1e8 ? 0 : 1 }) + " Cr";
  if (n >= 1e5) return "₹" + (n / 1e5).toLocaleString("en-IN", { maximumFractionDigits: 1 }) + " L";
  return inr(n);
}

/** Plain Indian-grouped number (no currency). */
export function num(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

/** e₹ amounts arrive as 18-decimal wei strings; convert to a whole-rupee number. */
export function fromWei(v: string | number | bigint | undefined): number {
  if (v === undefined || v === null) return 0;
  try { return Number(BigInt(typeof v === "string" ? v.split(".")[0] : Math.trunc(Number(v))) / 10n ** 16n) / 100; }
  catch { return Number(v) / 1e18; }
}

/** Short on-chain address: 0x1234…ab12. */
export function shortAddr(a?: string): string {
  if (!a) return "—";
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** Relative time like "2 hrs ago", "3 days ago". */
export function timeAgo(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} hr${h > 1 ? "s" : ""} ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d} day${d > 1 ? "s" : ""} ago`;
  const mo = Math.floor(d / 30); if (mo < 12) return `${mo} mo ago`;
  return `${Math.floor(mo / 12)} yr ago`;
}

export function dateFmt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ---- Domain labels ---------------------------------------------------------
export const SCHEME_CATEGORY_LABELS: Record<string, string> = {
  AGRICULTURE: "Agriculture & Rural",
  EDUCATION: "Education & Skilling",
  HOUSING: "Housing & Urban",
  HEALTH: "Health & Wellness",
  EMPLOYMENT: "Employment",
  SOCIAL_WELFARE: "Pensions & Welfare",
};
export const SCHEME_CATEGORY_SHORT: Record<string, string> = {
  AGRICULTURE: "Agriculture", EDUCATION: "Education", HOUSING: "Housing",
  HEALTH: "Health", EMPLOYMENT: "Employment", SOCIAL_WELFARE: "Social Welfare",
};
export const VENDOR_CATEGORY_LABELS: Record<string, string> = {
  AGRI_INPUT: "Agri-input supplier",
  EDU_INSTITUTION: "Educational institution",
  TECH_STORE: "Technology store",
  HOUSING_MATERIAL: "Housing material supplier",
};
export const ROLE_LABELS: Record<string, string> = {
  CITIZEN: "Citizen", VENDOR: "Vendor", ADMIN: "Scheme Administrator", RBI_ADMIN: "Reserve Bank of India",
};

/** Map a domain status string to a badge variant class. */
export function statusBadge(status?: string): "badge-ok" | "badge-info" | "badge-warn" | "badge-err" | "badge" {
  switch ((status ?? "").toUpperCase()) {
    case "APPROVED":
    case "DELIVERED":
    case "REDEEMED":
    case "RESOLVED":
    case "ACTIVE":
      return "badge-ok";
    case "PENDING":
    case "PAID":
    case "OPEN":
      return "badge-warn";
    case "REJECTED":
    case "FAILED":
      return "badge-err";
    default:
      return "badge-info";
  }
}

export function titleCase(s?: string): string {
  if (!s) return "";
  return s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
