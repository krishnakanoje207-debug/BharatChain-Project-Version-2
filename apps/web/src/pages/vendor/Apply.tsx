import { FormEvent, useState } from "react";
import { api, SchemeView, VendorView, VendorAppView, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { usePoll } from "../../lib/usePoll";
import { Panel, Notice } from "../../components/ui";
import { Icon } from "../../components/icons";
import { useT } from "../../lib/i18n";
import { findSelf, serveableSchemes, VENDOR_SERVES } from "./vendorUtil";

export default function VendorApply() {
  const { user } = useAuth();
  const { t } = useT();
  const STEPS = [
    { t: t("vn.enrol.step1t"), d: t("vn.enrol.step1d") },
    { t: t("vn.enrol.step2t"), d: t("vn.enrol.step2d") },
    { t: t("vn.enrol.step3t"), d: t("vn.enrol.step3d") },
    { t: t("vn.enrol.step4t"), d: t("vn.enrol.step4d") },
  ];
  const [vendors, setVendors] = useState<VendorView[]>([]);
  const [schemes, setSchemes] = useState<SchemeView[]>([]);
  const [apps, setApps] = useState<VendorAppView[]>([]);
  const [form, setForm] = useState({ businessName: "", businessId: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    api.vendors().then(setVendors).catch(() => setVendors([]));
    api.allSchemes().then(setSchemes).catch(() => setSchemes([]));
    api.myVendorApplication().then(setApps).catch(() => setApps([]));
  };
  usePoll(load, 15000);

  const self = findSelf(user, vendors);
  const latest = apps[0];
  const enrolled = Boolean(self) || latest?.status === "APPROVED";
  const pending = !enrolled && latest?.status === "PENDING";
  const rejected = !enrolled && latest?.status === "REJECTED";
  const showForm = !enrolled && !pending; // no application yet, or a rejected one to resubmit

  const sectors = self ? (VENDOR_SERVES[self.category] ?? []) : [];
  const serves = serveableSchemes(self?.category, schemes);

  const set = (k: "businessName" | "businessId") => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await api.applyVendor({ businessName: form.businessName.trim(), businessId: form.businessId.trim() });
      setForm({ businessName: "", businessId: "" });
      load();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "Could not submit your application. Please try again.");
    } finally { setBusy(false); }
  };

  return (
    <div className="stack" style={{ gap: "var(--sp-6)", maxWidth: 820 }}>
      <div>
        <h2 style={{ fontSize: "var(--t-2xl)" }}>{t("vn.enrol.title")}</h2>
        <p style={{ marginTop: 4 }}>{t("vn.enrol.sub")}</p>
      </div>

      {/* ---- current status ---- */}
      <div className={`card`} style={{ borderColor: enrolled ? "var(--green)" : pending ? "var(--border-strong)" : rejected ? "var(--err-fg, var(--border-strong))" : "var(--border-strong)" }}>
        <div className="row" style={{ gap: "var(--sp-4)" }}>
          <span className="emblem" style={{ width: 52, height: 52, background: enrolled ? "var(--ok-bg)" : "var(--surface-2)", color: enrolled ? "var(--ok-fg)" : "var(--ink-3)" }}>
            {enrolled ? <Icon.checkCircle size={26} /> : pending ? <Icon.clock size={26} /> : <Icon.store size={26} />}
          </span>
          <div style={{ flex: 1 }}>
            <h3>
              {enrolled ? t("vn.enrol.enrolled")
                : pending ? t("vn.enrol.pendingTitle")
                : rejected ? t("vn.enrol.rejectedTitle")
                : t("vn.enrol.notEnrolled")}
            </h3>
            <p style={{ fontSize: "var(--t-sm)", marginTop: 4 }}>
              {enrolled
                ? t("vn.enrol.enrolledBody", { cat: self?.category ? t(`vcat.${self.category}`) : "—", n: serves.length })
                : pending ? t("vn.enrol.pendingBody", { biz: latest?.businessName ?? "—" })
                : rejected ? t("vn.enrol.rejectedBody", { reason: latest?.rejectionReason ?? "—" })
                : t("vn.enrol.notEnrolledBody")}
            </p>
            {enrolled && sectors.length > 0 && (
              <div className="row" style={{ flexWrap: "wrap", gap: "var(--sp-2)", marginTop: "var(--sp-3)" }}>
                {sectors.map((s) => <span key={s} className="badge badge-ok"><span className="dot" /> {t(`cat.${s}`)}</span>)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---- self-registration form ---- */}
      {showForm && (
        <Panel title={t("vn.enrol.formTitle")} sub={t("vn.enrol.formHint")}>
          <form onSubmit={submit} className="stack" style={{ gap: "var(--sp-4)" }}>
            {err && <Notice kind="err">{err}</Notice>}
            <div className="form-row">
              <label className="lbl">{t("vn.enrol.bizName")}</label>
              <input className="field" value={form.businessName} onChange={set("businessName")} placeholder={t("vn.enrol.bizNamePh")} required minLength={3} />
            </div>
            <div className="form-row">
              <label className="lbl">{t("vn.enrol.bizId")}</label>
              <input className="field" value={form.businessId} onChange={set("businessId")} placeholder={t("vn.enrol.bizIdPh")} required minLength={3} />
            </div>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? t("vn.enrol.submitting") : rejected ? t("vn.enrol.reapply") : t("vn.enrol.submit")}
              </button>
            </div>
          </form>
        </Panel>
      )}

      <Panel title={t("vn.enrol.howTitle")}>
        <div className="stack" style={{ gap: "var(--sp-4)" }}>
          {STEPS.map((s, i) => (
            <div key={s.t} className="row" style={{ alignItems: "flex-start", gap: "var(--sp-4)" }}>
              <span className="emblem" style={{ width: 36, height: 36, background: "var(--surface-2)", color: "var(--navy)", fontWeight: 800, flex: "none" }}>{i + 1}</span>
              <div><b style={{ color: "var(--ink)" }}>{s.t}</b><p style={{ fontSize: "var(--t-sm)", marginTop: 2 }}>{s.d}</p></div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
