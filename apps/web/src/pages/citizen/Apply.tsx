import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, SchemeView } from "../../lib/api";
import { usePoll } from "../../lib/usePoll";
import { useT } from "../../lib/i18n";
import { inr } from "../../lib/format";
import { Panel, Loading, Notice, EmptyState } from "../../components/ui";
import { Icon } from "../../components/icons";

type Result = { status: string; reason?: string; txHash?: string };

export default function Apply() {
  const { t } = useT();
  const { id } = useParams();
  const [params] = useSearchParams();
  const preset = id ?? params.get("scheme") ?? params.get("schemeId");
  const [schemes, setSchemes] = useState<SchemeView[] | null>(null);
  const [schemeId, setSchemeId] = useState<number | null>(preset ? Number(preset) : null);
  const [form, setForm] = useState({ pan: "", kissan: "", land: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  usePoll(() => { api.allSchemes().then((s) => setSchemes(s.filter((x) => x.active))).catch(() => setSchemes([])); }, 15000);

  const scheme = schemes?.find((s) => s.schemeId === schemeId);

  const submit = async () => {
    if (schemeId == null) return;
    setErr(null); setBusy(true);
    try {
      const created = await api.createApplication({
        schemeId, pan: form.pan.toUpperCase().trim(),
        kissan: form.kissan.trim() || undefined, land: form.land.trim() || undefined,
      });
      const res = await api.submitApplication(created.id);
      setResult(res);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  };

  // ---- Result screen ----
  if (result) {
    const ok = result.status === "APPROVED";
    return (
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div className="card center">
          <span className="emblem" style={{ width: 64, height: 64, margin: "0 auto var(--sp-4)", background: ok ? "var(--ok-bg)" : "var(--err-bg)", color: ok ? "var(--ok-fg)" : "var(--err-fg)" }}>
            {ok ? <Icon.check size={32} /> : <Icon.x size={32} />}
          </span>
          <h2 style={{ fontSize: "var(--t-2xl)" }}>{ok ? t("cz.apply.approved") : t("cz.apply.notApproved")}</h2>
          <p style={{ marginTop: "var(--sp-3)" }}>
            {ok
              ? t("cz.apply.approvedBody")
              : result.reason ?? t("cz.apply.ineligible")}
          </p>
          {result.txHash && <div className="caption mono" style={{ marginTop: "var(--sp-3)" }}>{t("cz.apply.enrolTx")} {result.txHash.slice(0, 22)}…</div>}
          <div className="row" style={{ justifyContent: "center", marginTop: "var(--sp-5)", gap: "var(--sp-3)" }}>
            <Link to="/citizen" className="btn btn-primary">{t("cz.apply.goDashboard")}</Link>
            {ok && <Link to="/citizen/wallet" className="btn btn-secondary">{t("cz.apply.openWallet")}</Link>}
            {!ok && <button className="btn btn-secondary" onClick={() => { setResult(null); setSchemeId(null); }}>{t("cz.apply.tryAnother")}</button>}
          </div>
        </div>
      </div>
    );
  }

  // ---- Scheme picker ----
  if (schemeId == null) {
    return (
      <div className="stack" style={{ gap: "var(--sp-5)" }}>
        <div>
          <h2 style={{ fontSize: "var(--t-2xl)" }}>{t("cz.apply.title")}</h2>
          <p style={{ marginTop: 4 }}>{t("cz.apply.pickSub")}</p>
        </div>
        {!schemes && <Loading />}
        {schemes?.length === 0 && <EmptyState icon="layers" title={t("cz.apply.noActiveTitle")} note={t("cz.apply.noActiveNote")} />}
        <div className="grid cols-2">
          {schemes?.map((s) => (
            <button key={s.schemeId} className="card card-hover" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => setSchemeId(s.schemeId)}>
              <div className="row-between">
                <span className="badge badge-info">{t(`cat.${s.category}`)}</span>
                <Icon.chevronRight size={18} />
              </div>
              <h3 style={{ marginTop: "var(--sp-3)", fontSize: "var(--t-lg)" }}>{s.name}</h3>
              <p style={{ fontSize: "var(--t-sm)", marginTop: 6 }}>{t("cz.apply.installmentLine", { amt: inr(Number(s.installmentFormatted)) })}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---- Application form ----
  return (
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      <Panel title={t("cz.apply.formTitle")} sub={scheme ? scheme.name : `Scheme #${schemeId}`}
        actions={<button className="btn btn-ghost btn-sm" onClick={() => setSchemeId(null)}>{t("cz.apply.changeScheme")}</button>}>
        {err && <Notice kind="err">{err}</Notice>}
        <Notice>{t("cz.apply.proofNotice")}</Notice>

        <div className="stack" style={{ marginTop: "var(--sp-4)" }}>
          <div className="form-row">
            <label className="lbl">PAN</label>
            <input className="field" value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value })} placeholder="ABCDE1234F" style={{ textTransform: "uppercase" }} required />
          </div>
          <div className="form-grid">
            <div className="form-row">
              <label className="lbl">{t("cz.apply.kisan")} <span className="caption">{t("common.optional")}</span></label>
              <input className="field" value={form.kissan} onChange={(e) => setForm({ ...form, kissan: e.target.value })} placeholder="KCC100000" />
            </div>
            <div className="form-row">
              <label className="lbl">{t("cz.apply.land")} <span className="caption">{t("common.optional")}</span></label>
              <input className="field" value={form.land} onChange={(e) => setForm({ ...form, land: e.target.value })} placeholder="LR200000" />
            </div>
          </div>
          <button className="btn btn-accent btn-lg btn-block" disabled={busy || !form.pan} onClick={submit}>
            {busy ? <><span className="spinner" style={{ borderTopColor: "#3a2200" }} /> {t("cz.apply.verifying")}</> : t("cz.apply.verifySubmit")}
          </button>
          <div className="hint center">{t("cz.apply.panHint")}</div>
        </div>
      </Panel>
    </div>
  );
}
