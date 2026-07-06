import { useState } from "react";
import { api, SchemeView } from "../../lib/api";
import { usePoll } from "../../lib/usePoll";
import { fromWei, inrCompact, num, SCHEME_CATEGORY_LABELS, VENDOR_CATEGORY_LABELS } from "../../lib/format";
import { Kpi, Panel, StatusBadge, Loading, Notice } from "../../components/ui";
import { Icon } from "../../components/icons";

// Only sectors with a live ZK eligibility circuit can host schemes — the rest
// would reject every applicant (backend blocks them too).
const SCHEME_CATEGORIES = ["AGRICULTURE", "EDUCATION", "HOUSING"];
const PENDING_CATEGORIES = ["HEALTH", "EMPLOYMENT", "SOCIAL_WELFARE"];
const VENDOR_CATEGORIES = ["AGRI_INPUT", "EDU_INSTITUTION", "TECH_STORE", "HOUSING_MATERIAL"];

const emptyForm = {
  name: "",
  category: "AGRICULTURE",
  fundRupees: "",
  installmentRupees: "",
  maxInstallments: "3",
  ministry: "",
  description: "",
  allowedVendorCategories: ["AGRI_INPUT"] as string[],
};

export default function AdminSchemes() {
  const [schemes, setSchemes] = useState<SchemeView[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [topUpFor, setTopUpFor] = useState<number | null>(null);
  const [topUpAmt, setTopUpAmt] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = () => api.allSchemes().then(setSchemes).catch(() => setSchemes([]));
  usePoll(reload);

  const list = schemes ?? [];
  const active = list.filter((s) => s.active).length;
  const outlay = list.reduce((s, x) => s + (Number(x.fundFormatted) || 0), 0);
  const disbursed = list.reduce((s, x) => s + fromWei(x.disbursed), 0);

  const toggleVendorCat = (c: string) =>
    setForm((f) => ({
      ...f,
      allowedVendorCategories: f.allowedVendorCategories.includes(c)
        ? f.allowedVendorCategories.filter((x) => x !== c)
        : [...f.allowedVendorCategories, c],
    }));

  const setActive = async (s: SchemeView, next: boolean) => {
    setBusyId(s.schemeId); setMsg(null); setErr(null);
    try { await api.updateScheme(s.schemeId, { active: next }); setMsg(`"${s.name}" is now ${next ? "active" : "inactive"}.`); reload(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusyId(null); }
  };

  const topUp = async (s: SchemeView) => {
    if (!topUpAmt) return;
    setBusyId(s.schemeId); setMsg(null); setErr(null);
    try {
      await api.updateScheme(s.schemeId, { topUpRupees: topUpAmt.trim() });
      setMsg(`Topped up "${s.name}" by ₹${num(Number(topUpAmt))}.`);
      setTopUpFor(null); setTopUpAmt(""); reload();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusyId(null); }
  };

  const create = async () => {
    setCreating(true); setMsg(null); setErr(null);
    try {
      const created = await api.createScheme({
        name: form.name.trim(),
        category: form.category,
        fundRupees: form.fundRupees.trim(),
        installmentRupees: form.installmentRupees.trim(),
        maxInstallments: form.maxInstallments ? Number(form.maxInstallments) : undefined,
        allowedVendorCategories: form.allowedVendorCategories,
        ministry: form.ministry.trim() || undefined,
        description: form.description.trim() || undefined,
      });
      setMsg(`Created scheme "${created.name}" (#${created.schemeId}) on-chain.`);
      setForm(emptyForm);
      reload();
    } catch (e) { setErr((e as Error).message); }
    finally { setCreating(false); }
  };

  const canCreate =
    form.name.trim().length >= 3 && form.fundRupees && form.installmentRupees && form.allowedVendorCategories.length > 0;

  return (
    <div className="stack" style={{ gap: "var(--sp-6)" }}>
      <div className="kpi-grid">
        <Kpi icon="layers" value={active} label="Active schemes" />
        <Kpi icon="chart" value={inrCompact(outlay)} label="Total outlay sanctioned" />
        <Kpi icon="rupee" value={inrCompact(disbursed)} label="Disbursed (e₹)" />
        <Kpi icon="shield" value={list.length} label="Schemes on-chain" />
      </div>

      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="err">{err}</Notice>}

      {!schemes && <Loading />}

      {schemes && (
        <Panel title="Scheme registry" sub="Activate, deactivate or top up a scheme fund" flush>
          <table className="table">
            <thead><tr><th>Scheme</th><th>Sector</th><th>Outlay</th><th>Remaining</th><th>Installment</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.schemeId}>
                  <td><b style={{ color: "var(--ink)" }}>{s.name}</b><div className="caption">#{s.schemeId}{s.ministry ? ` · ${s.ministry}` : ""}</div></td>
                  <td>{SCHEME_CATEGORY_LABELS[s.category] ?? s.category}</td>
                  <td>₹{num(Number(s.fundFormatted))}</td>
                  <td>₹{num(Number(s.remainingFormatted))}</td>
                  <td>₹{num(Number(s.installmentFormatted))}</td>
                  <td><StatusBadge status={s.active ? "ACTIVE" : "REJECTED"} /></td>
                  <td>
                    {topUpFor === s.schemeId ? (
                      <div className="row" style={{ gap: 6, alignItems: "center" }}>
                        <input className="field" style={{ width: 120, padding: "4px 8px" }} value={topUpAmt}
                          onChange={(e) => setTopUpAmt(e.target.value)} placeholder="₹ amount" inputMode="decimal" autoFocus />
                        <button className="btn btn-primary btn-sm" disabled={busyId === s.schemeId || !topUpAmt} onClick={() => topUp(s)}>Add</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setTopUpFor(null); setTopUpAmt(""); }}>Cancel</button>
                      </div>
                    ) : (
                      <div className="row" style={{ gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" disabled={busyId === s.schemeId} onClick={() => { setTopUpFor(s.schemeId); setTopUpAmt(""); }}>Top up</button>
                        {s.active
                          ? <button className="btn btn-danger btn-sm" disabled={busyId === s.schemeId} onClick={() => setActive(s, false)}>Deactivate</button>
                          : <button className="btn btn-primary btn-sm" disabled={busyId === s.schemeId} onClick={() => setActive(s, true)}>Activate</button>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <Panel title="Create a new scheme" sub="Deployed on-chain via the relayer — category & installment are fixed once enrolees exist">
        <div className="stack" style={{ gap: "var(--sp-4)" }}>
          <div className="form-row">
            <label className="lbl">Scheme name</label>
            <input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. PM Surya Ghar Solar" />
          </div>
          <div className="form-grid">
            <div className="form-row">
              <label className="lbl">Sector</label>
              <select className="field" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {SCHEME_CATEGORIES.map((c) => <option key={c} value={c}>{SCHEME_CATEGORY_LABELS[c] ?? c}</option>)}
                {PENDING_CATEGORIES.map((c) => (
                  <option key={c} value={c} disabled>{SCHEME_CATEGORY_LABELS[c] ?? c} — eligibility circuit pending</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label className="lbl">Ministry <span className="caption">(optional)</span></label>
              <input className="field" value={form.ministry} onChange={(e) => setForm({ ...form, ministry: e.target.value })} placeholder="Ministry of …" />
            </div>
          </div>
          <div className="form-grid">
            <div className="form-row">
              <label className="lbl">Total fund (whole ₹ of e₹)</label>
              <input className="field" value={form.fundRupees} onChange={(e) => setForm({ ...form, fundRupees: e.target.value })} placeholder="e.g. 100000000" inputMode="numeric" />
            </div>
            <div className="form-row">
              <label className="lbl">Per-installment (whole ₹)</label>
              <input className="field" value={form.installmentRupees} onChange={(e) => setForm({ ...form, installmentRupees: e.target.value })} placeholder="e.g. 6000" inputMode="numeric" />
            </div>
          </div>
          <div className="form-row" style={{ maxWidth: 220 }}>
            <label className="lbl">Max installments</label>
            <input className="field" value={form.maxInstallments} onChange={(e) => setForm({ ...form, maxInstallments: e.target.value })} inputMode="numeric" placeholder="3" />
          </div>
          <div className="form-row">
            <label className="lbl">Allowed vendor categories</label>
            <div className="row" style={{ flexWrap: "wrap", gap: "var(--sp-2)" }}>
              {VENDOR_CATEGORIES.map((c) => {
                const on = form.allowedVendorCategories.includes(c);
                return (
                  <button key={c} type="button" className={`badge ${on ? "badge-ok" : ""}`} style={{ cursor: "pointer", border: on ? undefined : "1px solid var(--border-strong)" }} onClick={() => toggleVendorCat(c)}>
                    {on && <span className="dot" />} {VENDOR_CATEGORY_LABELS[c] ?? c}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="form-row">
            <label className="lbl">Description <span className="caption">(optional)</span></label>
            <textarea className="field" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short public description of the scheme." />
          </div>
          <button className="btn btn-accent btn-lg" disabled={creating || !canCreate} onClick={create}>
            {creating ? <><span className="spinner" style={{ borderTopColor: "#3a2200" }} /> Deploying on-chain…</> : <><Icon.plus size={16} /> Create scheme</>}
          </button>
        </div>
      </Panel>
    </div>
  );
}
