import { FormEvent, useState } from "react";
import { api, RedemptionView, ApiError } from "../../lib/api";
import { usePoll } from "../../lib/usePoll";
import { inr } from "../../lib/format";
import { Kpi, Panel, StatusBadge, Loading, EmptyState, Notice } from "../../components/ui";
import { useT } from "../../lib/i18n";

export default function VendorRedemptions() {
  const { t } = useT();
  const [items, setItems] = useState<RedemptionView[] | null>(null);
  const [redeemable, setRedeemable] = useState<{ approved: boolean; redeemableFormatted: string } | null>(null);
  const [form, setForm] = useState({ amount: "", itrNumber: "", bankAccount: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    api.myRedemptions().then(setItems).catch(() => setItems([]));
    api.myRedeemable().then(setRedeemable).catch(() => setRedeemable({ approved: false, redeemableFormatted: "0.0" }));
  };
  usePoll(load);

  const mine = items ?? [];
  const settled = mine.filter((r) => r.status === "APPROVED").reduce((s, r) => s + (Number(r.amountFormatted) || 0), 0);
  const pending = mine.filter((r) => r.status === "PENDING").length;
  const approved = redeemable?.approved ?? false;
  const redeemableAmt = Number(redeemable?.redeemableFormatted ?? "0");

  const set = (k: "amount" | "itrNumber" | "bankAccount") => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null); setErr(null); setBusy(true);
    try {
      await api.fileMyRedemption({
        amount: form.amount.trim(),
        itrNumber: form.itrNumber.trim() || undefined,
        bankAccount: form.bankAccount.trim() || undefined,
      });
      setForm({ amount: "", itrNumber: "", bankAccount: "" });
      setMsg(t("vn.red.filed"));
      load();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "Could not file the redemption. Please try again.");
    } finally { setBusy(false); }
  };

  return (
    <div className="stack" style={{ gap: "var(--sp-6)" }}>
      <div>
        <h2 style={{ fontSize: "var(--t-2xl)" }}>{t("vnnav.redemptions")}</h2>
        <p style={{ marginTop: 4 }}>{t("vn.red.sub")}</p>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <Kpi icon="rupee" value={inr(settled)} label={t("vn.red.settled")} />
        <Kpi icon="clock" value={pending} label={t("vn.red.pendingApproval")} />
        <Kpi icon="refresh" value={mine.length} label={t("vn.red.total")} />
      </div>

      {(!items || !redeemable) && <Loading />}

      {/* ---- file a redemption (approved vendors) ---- */}
      {redeemable && !approved && (
        <Panel title={t("vn.red.notApprovedTitle")}>
          <Notice kind="warn">{t("vn.red.notApprovedBody")}</Notice>
        </Panel>
      )}

      {redeemable && approved && (
        <Panel title={t("vn.red.fileTitle")} sub={t("vn.red.fileSub")}>
          <form onSubmit={submit} className="stack" style={{ gap: "var(--sp-4)" }}>
            {msg && <Notice kind="ok">{msg}</Notice>}
            {err && <Notice kind="err">{err}</Notice>}
            <div className="row-between" style={{ paddingBottom: "var(--sp-3)", borderBottom: "1px solid var(--border)" }}>
              <span className="caption">{t("vn.red.redeemable")}</span>
              <b style={{ color: "var(--navy)", fontSize: "var(--t-lg)" }}>{inr(redeemableAmt)}</b>
            </div>
            <div className="form-row">
              <label className="lbl">{t("vn.red.amount")}</label>
              <input className="field" type="number" min="1" step="0.01" value={form.amount} onChange={set("amount")} placeholder={t("vn.red.amountPh")} required />
            </div>
            <div className="form-row">
              <label className="lbl">{t("vn.red.itr")}</label>
              <input className="field" value={form.itrNumber} onChange={set("itrNumber")} placeholder={t("vn.red.itrPh")} />
            </div>
            <div className="form-row">
              <label className="lbl">{t("vn.red.bank")}</label>
              <input className="field" value={form.bankAccount} onChange={set("bankAccount")} placeholder={t("vn.red.bankPh")} />
            </div>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="submit" className="btn btn-primary" disabled={busy || redeemableAmt <= 0}>
                {busy ? t("vn.red.filing") : t("vn.red.fileBtn")}
              </button>
            </div>
          </form>
        </Panel>
      )}

      {/* ---- history ---- */}
      {items && mine.length === 0 && (
        <EmptyState icon="refresh" title={t("vn.red.noneTitle")} note={t("vn.red.noneNote")} />
      )}

      {mine.length > 0 && (
        <Panel flush>
          <table className="table">
            <thead><tr><th>{t("col.amount")}</th><th>{t("col.itr")}</th><th>{t("col.status")}</th><th>{t("col.payoutRef")}</th><th>{t("col.filed")}</th></tr></thead>
            <tbody>
              {mine.map((r) => (
                <tr key={r.id}>
                  <td><b style={{ color: "var(--navy)" }}>{inr(Number(r.amountFormatted))}</b></td>
                  <td className="mono">{r.itrNumber ?? "—"}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="mono caption">{r.payoutReference ?? "—"}</td>
                  <td className="caption">{new Date(r.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
