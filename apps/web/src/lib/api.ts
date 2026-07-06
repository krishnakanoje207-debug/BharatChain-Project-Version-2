// ============================================================================
// Unified BharatChain API client — every backend surface in one typed client.
// Holds the access/refresh tokens (localStorage) and transparently refreshes on
// a 401. Backend defaults to http://localhost:3001/api (CORS already allows :3000).
// ============================================================================
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3001/api";

const ACCESS = "bc_access";
const REFRESH = "bc_refresh";

export const tokens = {
  get access() { return localStorage.getItem(ACCESS); },
  get refresh() { return localStorage.getItem(REFRESH); },
  set(t: { accessToken: string; refreshToken: string }) {
    localStorage.setItem(ACCESS, t.accessToken);
    localStorage.setItem(REFRESH, t.refreshToken);
  },
  clear() { localStorage.removeItem(ACCESS); localStorage.removeItem(REFRESH); },
};

// ---- Domain types ----------------------------------------------------------
export type Role = "CITIZEN" | "VENDOR" | "ADMIN" | "RBI_ADMIN";

export interface PublicUser {
  id: string; phone: string; role: Role; fullName?: string; email?: string;
  chainAddress?: string; phoneVerified: boolean;
}
export interface SchemeView {
  schemeId: number; name: string; category: string; description?: string; ministry?: string;
  active: boolean; fundFormatted: string; disbursed: string; remainingFormatted: string;
  installmentFormatted: string;
}
export interface SchemeGroup { category: string; schemes: SchemeView[] }
export interface DocumentView { id: string; docType: string; status?: string; declaredId?: string; createdAt?: string }
export interface AppView {
  id: string; schemeId: number; schemeName?: string; status: string; enrollTxHash?: string;
  rejectionReason?: string; createdAt: string; documents?: DocumentView[];
}
export interface AdminAppView {
  id: string; schemeId: number; schemeName: string; status: string; applicant: string;
  phone?: string; enrollTxHash?: string; rejectionReason?: string; createdAt: string;
}
export interface CreateSchemeBody {
  name: string; category: string; fundRupees: string; installmentRupees: string;
  maxInstallments?: number; allowedVendorCategories: string[]; ministry?: string; description?: string;
}
export interface UpdateSchemeBody {
  active?: boolean; topUpRupees?: string; maxInstallments?: number; ministry?: string; description?: string;
}
export interface Entitlement { schemeId: number; schemeName: string; entitlementFormatted: string }
export interface Notif { id: string; type: string; title: string; body: string; read: boolean; createdAt: string }
export interface VendorView { address: string; name: string; category: string; city?: string }
export interface VendorAppView {
  id: string; businessName: string; businessId: string; category: string; city?: string;
  status: string; vendorAddress?: string; rejectionReason?: string; createdAt: string;
}
export interface AdminVendorAppView extends VendorAppView { applicant: string; phone?: string }
export interface PaymentView {
  id: string; onChainId: number; schemeId: number; vendorName?: string; vendorAddress: string;
  amountFormatted: string; status: string; createdAt: string;
}
export interface RoundView {
  id: string; schemeId: number; installmentId: number; installmentNo: number;
  beneficiaryCount: number; claimedCount: number; allocated: string; createdAt: string;
}
export interface AnomalyView {
  id: string; type: string; severity: string; subjectId: string; message: string;
  status: string; createdAt: string;
}
export interface RedemptionView {
  id: string; onChainId: number; vendorName?: string; vendorAddress: string; amountFormatted: string;
  status: string; itrNumber?: string; bankAccount?: string; payoutReference?: string; createdAt: string;
}
export interface Tokens { accessToken: string; refreshToken: string }
export interface Session { tokens: Tokens; user: PublicUser }

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// ---- Transport -------------------------------------------------------------
async function raw(path: string, init: RequestInit): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !isForm) headers["content-type"] = "application/json";
  if (tokens.access) headers["authorization"] = `Bearer ${tokens.access}`;
  return fetch(BASE + path, { ...init, headers });
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await raw(path, init);
  if (res.status === 401 && tokens.refresh) {
    // Try a single refresh, then retry the original request once.
    const r = await fetch(BASE + "/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refresh }),
    });
    if (r.ok) { tokens.set(await r.json()); res = await raw(path, init); }
    else tokens.clear();
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const msg = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    throw new ApiError(res.status, msg ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const GET = <T,>(p: string) => request<T>(p);
const POST = <T,>(p: string, b?: unknown) =>
  request<T>(p, { method: "POST", body: b !== undefined ? JSON.stringify(b) : undefined });
const POSTFORM = <T,>(p: string, form: FormData) => request<T>(p, { method: "POST", body: form });

function qs(params: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

// ---- API -------------------------------------------------------------------
export const api = {
  // ---------- auth ----------
  signup: (b: { phone: string; password: string; fullName?: string; email?: string; role?: "CITIZEN" | "VENDOR" }) =>
    POST<{ devCode?: string }>("/auth/signup", b),
  verifyOtp: (phone: string, code: string) => POST<Session>("/auth/verify-otp", { phone, code }),
  login: (phone: string, password: string) => POST<Session>("/auth/login", { phone, password }),
  forgotPassword: (phone: string) => POST<{ devCode?: string }>("/auth/forgot-password", { phone }),
  resetPassword: (phone: string, code: string, newPassword: string) =>
    POST<{ ok: boolean }>("/auth/reset-password", { phone, code, newPassword }),
  me: () => GET<PublicUser>("/auth/me"),
  heartbeat: () => POST<{ ok: boolean }>("/auth/heartbeat"),
  logout: () => POST("/auth/logout", { refreshToken: tokens.refresh }).catch(() => undefined),

  // ---------- schemes (public) ----------
  browseSchemes: (q?: string, category?: string) => GET<SchemeGroup[]>(`/schemes${qs({ q, category })}`),
  allSchemes: () => GET<SchemeView[]>("/schemes/all"),
  scheme: (id: number) => GET<SchemeView>(`/schemes/${id}`),

  // ---------- schemes (admin) ----------
  createScheme: (b: CreateSchemeBody) => POST<SchemeView>("/schemes", b),
  updateScheme: (id: number, b: UpdateSchemeBody) =>
    request<SchemeView>(`/schemes/${id}`, { method: "PATCH", body: JSON.stringify(b) }),

  // ---------- citizen applications ----------
  myApplications: () => GET<AppView[]>("/applications/mine"),
  allApplications: () => GET<AdminAppView[]>("/applications"),
  application: (id: string) => GET<AppView>(`/applications/${id}`),
  createApplication: (b: { schemeId: number; pan: string; kissan?: string; land?: string }) =>
    POST<{ id: string; status: string; applicant?: { name: string } }>("/applications", b),
  uploadDocument: (id: string, file: File, docType: string, declaredId?: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("docType", docType);
    if (declaredId) form.append("declaredId", declaredId);
    return POSTFORM<DocumentView>(`/applications/${id}/documents`, form);
  },
  submitApplication: (id: string) =>
    POST<{ status: string; reason?: string; txHash?: string }>(`/applications/${id}/submit`),

  // ---------- me (wallet + notifications) ----------
  entitlements: () => GET<Entitlement[]>("/me/entitlements"),
  notifications: () => GET<Notif[]>("/me/notifications"),
  markRead: (id: string) => POST(`/me/notifications/${id}/read`),

  // ---------- vendors ----------
  vendors: (schemeId?: number) => GET<VendorView[]>(`/vendors${qs({ schemeId })}`),
  enrollVendor: (address: string, schemeId?: number) =>
    POST(`/vendors/${address}/enroll`, schemeId !== undefined ? { schemeId } : {}),

  // ---------- vendor onboarding (self-signup → admin approve) ----------
  applyVendor: (b: { businessName: string; businessId: string }) =>
    POST<VendorAppView>("/vendor-applications", b),
  myVendorApplication: () => GET<VendorAppView[]>("/vendor-applications/mine"),
  vendorApplications: (status?: string) => GET<AdminVendorAppView[]>(`/vendor-applications${qs({ status })}`),
  approveVendorApplication: (id: string) =>
    POST<{ status: string; vendorAddress: string; schemesEnrolled: number }>(`/vendor-applications/${id}/approve`),
  rejectVendorApplication: (id: string, reason?: string) =>
    POST<{ status: string; reason: string }>(`/vendor-applications/${id}/reject`, { reason }),

  // ---------- payments (citizen → vendor) ----------
  pay: (b: { schemeId: number; vendorAddress: string; amount: string }) => POST<PaymentView>("/payments", b),
  myPayments: () => GET<PaymentView[]>("/payments"),
  payment: (id: string) => GET<PaymentView>(`/payments/${id}`),
  confirmDelivery: (id: string) => POST<PaymentView>(`/payments/${id}/confirm`),

  // ---------- disbursement (admin / RBI) ----------
  rounds: (schemeId?: number) => GET<RoundView[]>(`/disbursement/rounds${qs({ schemeId })}`),
  round: (id: string) => GET<RoundView>(`/disbursement/rounds/${id}`),
  runRound: (schemeId: number) => POST<RoundView>("/disbursement/rounds", { schemeId }),

  // ---------- anomalies (admin / RBI) ----------
  anomalies: (status?: string) => GET<AnomalyView[]>(`/anomalies${qs({ status })}`),
  resolveAnomaly: (id: string) => POST<AnomalyView>(`/anomalies/${id}/resolve`),

  // ---------- redemptions (admin files · RBI decides) ----------
  redemptions: (status?: string) => GET<RedemptionView[]>(`/redemptions${qs({ status })}`),
  redemption: (id: string) => GET<RedemptionView>(`/redemptions/${id}`),
  fileRedemption: (b: { vendorAddress: string; amount: string; itrNumber?: string; bankAccount?: string }) =>
    POST<RedemptionView>("/redemptions", b),
  approveRedemption: (id: string) => POST<RedemptionView>(`/redemptions/${id}/approve`),
  rejectRedemption: (id: string, reason?: string) => POST<RedemptionView>(`/redemptions/${id}/reject`, { reason }),

  // ---------- redemptions (vendor self-service) ----------
  myRedemptions: () => GET<RedemptionView[]>("/redemptions/mine"),
  myRedeemable: () => GET<{ approved: boolean; redeemable: string; redeemableFormatted: string }>("/redemptions/redeemable"),
  fileMyRedemption: (b: { amount: string; itrNumber?: string; bankAccount?: string }) =>
    POST<RedemptionView>("/redemptions/mine", b),

  // ---------- assistant ----------
  assistantSuggestions: () => GET<{ suggestions: string[] }>("/assistant/suggestions"),
  assistantLanguages: () => GET<{ code: string; name: string }[]>("/assistant/languages"),
  assistantChat: (message: string, language?: string) =>
    POST<{ answer: string; provider: string; language: string }>("/assistant/chat", { message, language }),
  // Anonymous visitor mode — public info only (schemes, how-it-works, registration).
  assistantPublicSuggestions: () => GET<{ suggestions: string[] }>("/assistant/public/suggestions"),
  assistantPublicChat: (message: string, language?: string) =>
    POST<{ answer: string; provider: string; language: string }>("/assistant/public/chat", { message, language }),

  // ---------- health ----------
  health: () => GET<{ status: string }>("/health"),
};
