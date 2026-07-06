import { useEffect, useState } from "react";
import { api, AnomalyView, RedemptionView, RoundView, SchemeView, VendorView } from "../lib/api";
import { usePoll } from "../lib/usePoll";
import { fromWei, inr, inrCompact, num, SCHEME_CATEGORY_LABELS, VENDOR_CATEGORY_LABELS, shortAddr } from "../lib/format";
import { Kpi, Panel, StatusBadge, Loading, EmptyState, Notice } from "./ui";
import { Icon } from "./icons";

// ============================================================ Treasury / schemes
export function TreasuryOverview() {
  const [schemes, setSchemes] = useState<SchemeView[] | null>(null);
  usePoll(() => { api.allSchemes().then(setSchemes).catch(() => setSchemes([])); });

  if (!schemes) return <Loading />;
  const outlay = schemes.reduce((s, x) => s + (Number(x.fundFormatted) || 0), 0);
  const disbursed = schemes.reduce((s, x) => s + fromWei(x.disbursed), 0);
  const active = schemes.filter((s) => s.active).length;

  return (
    <div className="stack" style={{ gap: "var(--sp-6)" }}>
      <div className="kpi-grid">
        <Kpi icon="layers" value={active} label="Active schemes" />
        <Kpi icon="chart" value={inrCompact(outlay)} label="Total outlay sanctioned" />
        <Kpi icon="rupee" value={inrCompact(disbursed)} label="Disbursed (e₹)" />
        <Kpi icon="shield" value="0" label="Leakage — audited on-chain" />
      </div>

      <Panel title="Scheme treasury" sub="Per-scheme fund position" flush>
        <table className="table">
          <thead><tr><th>Scheme</th><th>Sector</th><th>Outlay</th><th>Disbursed</th><th>Remaining</th><th>Status</th></tr></thead>
          <tbody>
            {schemes.map((s) => (
              <tr key={s.schemeId}>
                <td><b style={{ color: "var(--ink)" }}>{s.name}</b></td>
                <td>{SCHEME_CATEGORY_LABELS[s.category] ?? s.category}</td>
                <td>₹{num(Number(s.fundFormatted))}</td>
                <td><b style={{ color: "var(--navy)" }}>{inrCompact(fromWei(s.disbursed))}</b></td>
                <td>₹{num(Number(s.remainingFormatted))}</td>
                <td><StatusBadge status={s.active ? "ACTIVE" : "REJECTED"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

// ===================================================================== disbursement
export function DisbursementPanel() {
  const [schemes, setSchemes] = useState<SchemeView[]>([]);
  const [rounds, setRounds] = useState<RoundView[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = () => {
    api.allSchemes().then((s) => setSchemes(s.filter((x) => x.active))).catch(() => undefined);
    api.rounds().then(setRounds).catch(() => undefined);
  };
  usePoll(reload);

  const run = async (schemeId: number) => {
    setBusy(schemeId); setMsg(null); setErr(null);
    try {
      const r = await api.runRound(schemeId);
      setMsg(`Installment #${r.installmentNo} issued — ${r.claimedCount}/${r.beneficiaryCount} beneficiaries credited (${inrCompact(fromWei(r.allocated))}).`);
      reload();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  };

  const schemeName = (id: number) => schemes.find((s) => s.schemeId === id)?.name ?? `Scheme #${id}`;

  return (
    <div className="stack" style={{ gap: "var(--sp-6)" }}>
      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="err">{err}</Notice>}

      <Panel title="Trigger an installment" sub="Each round issues the NEXT installment — newcomers are caught up, no one is paid twice.">
        <div className="stack" style={{ gap: "var(--sp-3)" }}>
          {schemes.length === 0 && <p className="caption">No active schemes.</p>}
          {schemes.map((s) => (
            <div key={s.schemeId} className="row-between" style={{ paddingBottom: "var(--sp-3)", borderBottom: "1px solid var(--border)" }}>
              <div><b style={{ color: "var(--ink)" }}>{s.name}</b><div className="caption">Per beneficiary {inr(Number(s.installmentFormatted))}</div></div>
              <button className="btn btn-primary btn-sm" disabled={busy === s.schemeId} onClick={() => run(s.schemeId)}>
                {busy === s.schemeId ? "Disbursing…" : <><Icon.send size={14} /> Issue next installment</>}
              </button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Recent rounds" flush>
        {rounds.length === 0 ? <div className="panel-body"><p className="caption">No disbursement rounds yet.</p></div> : (
          <table className="table">
            <thead><tr><th>Scheme</th><th>Installment</th><th>Beneficiaries</th><th>Claimed</th><th>Allocated</th><th>Date</th></tr></thead>
            <tbody>
              {rounds.map((r) => (
                <tr key={r.id}>
                  <td><b style={{ color: "var(--ink)" }}>{schemeName(r.schemeId)}</b></td>
                  <td>#{r.installmentNo}</td>
                  <td>{r.beneficiaryCount}</td>
                  <td>{r.claimedCount}</td>
                  <td><b style={{ color: "var(--navy)" }}>{inrCompact(fromWei(r.allocated))}</b></td>
                  <td className="caption">{new Date(r.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

// ======================================================================= anomalies
export function AnomaliesPanel() {
  const [items, setItems] = useState<AnomalyView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const reload = () => api.anomalies().then(setItems).catch(() => setItems([]));
  usePoll(reload);

  const resolve = async (id: string) => { setBusy(id); try { await api.resolveAnomaly(id); reload(); } finally { setBusy(null); } };
  const open = items?.filter((a) => a.status === "OPEN").length ?? 0;

  return (
    <div className="stack" style={{ gap: "var(--sp-6)" }}>
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <Kpi icon="alert" value={open} label="Open anomalies" />
        <Kpi icon="checkCircle" value={(items?.length ?? 0) - open} label="Resolved" />
        <Kpi icon="shield" value={items?.length ?? 0} label="Total signals" />
      </div>
      {!items && <Loading />}
      {items?.length === 0 && <Notice kind="ok">No anomalies detected. The payment stream looks clean.</Notice>}
      {items && items.length > 0 && (
        <Panel title="Fraud & anomaly monitor" sub="Automated signals from the payment event stream (fan-in, velocity, self-dealing)" flush>
          <table className="table">
            <thead><tr><th>Type</th><th>Severity</th><th>Subject</th><th>Detail</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td><b style={{ color: "var(--ink)" }}>{a.type.replace(/_/g, " ")}</b></td>
                  <td><StatusBadge status={a.severity} /></td>
                  <td className="mono caption">{shortAddr(a.subjectId)}</td>
                  <td style={{ maxWidth: 340 }}>{a.message}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td>{a.status === "OPEN" && <button className="btn btn-secondary btn-sm" disabled={busy === a.id} onClick={() => resolve(a.id)}>Resolve</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}

// ===================================================================== redemptions
export function RedemptionsTable({ canDecide }: { canDecide: boolean }) {
  const [items, setItems] = useState<RedemptionView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const reload = () => api.redemptions().then(setItems).catch(() => setItems([]));
  usePoll(reload);

  const act = async (id: string, kind: "approve" | "reject") => {
    setBusy(id);
    try {
      if (kind === "approve") await api.approveRedemption(id);
      else await api.rejectRedemption(id, "Rejected after review.");
      reload();
    } finally { setBusy(null); }
  };

  const pending = items?.filter((r) => r.status === "PENDING").length ?? 0;
  const settled = items?.filter((r) => r.status === "APPROVED").reduce((s, r) => s + (Number(r.amountFormatted) || 0), 0) ?? 0;

  return (
    <div className="stack" style={{ gap: "var(--sp-6)" }}>
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <Kpi icon="clock" value={pending} label="Pending approval" />
        <Kpi icon="rupee" value={inr(settled)} label="Settled to fiat" />
        <Kpi icon="refresh" value={items?.length ?? 0} label="Total requests" />
      </div>
      {!items && <Loading />}
      {items?.length === 0 && <EmptyState icon="refresh" title="No redemption requests" note={canDecide ? "Filed redemptions will appear here for approval." : "Redemptions you file will appear here pending RBI approval."} />}
      {items && items.length > 0 && (
        <Panel title="Vendor redemptions" sub={canDecide ? "Approve after the ITR / legitimacy check — only delivered value is redeemable." : "Filed for Reserve Bank review."} flush>
          <table className="table">
            <thead><tr><th>Vendor</th><th>Amount</th><th>ITR</th><th>Status</th><th>Payout</th>{canDecide && <th></th>}</tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td><b style={{ color: "var(--ink)" }}>{r.vendorName ?? <span className="mono">{shortAddr(r.vendorAddress)}</span>}</b></td>
                  <td><b style={{ color: "var(--navy)" }}>{inr(Number(r.amountFormatted))}</b></td>
                  <td className="mono caption">{r.itrNumber ?? "—"}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="mono caption">{r.payoutReference ?? "—"}</td>
                  {canDecide && (
                    <td>
                      {r.status === "PENDING" && (
                        <div className="row" style={{ gap: 6 }}>
                          <button className="btn btn-primary btn-sm" disabled={busy === r.id} onClick={() => act(r.id, "approve")}>Approve</button>
                          <button className="btn btn-danger btn-sm" disabled={busy === r.id} onClick={() => act(r.id, "reject")}>Reject</button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}

// =============================================================== file redemption (admin)
export function FileRedemptionPanel() {
  const [vendors, setVendors] = useState<VendorView[]>([]);
  const [form, setForm] = useState({ vendorAddress: "", amount: "", itrNumber: "", bankAccount: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.vendors().then(setVendors).catch(() => setVendors([])); }, []);

  const submit = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await api.fileRedemption(form);
      setMsg(`Filed redemption of ${inr(Number(r.amountFormatted))} for ${r.vendorName ?? "vendor"} — pending RBI approval.`);
      setForm({ vendorAddress: "", amount: "", itrNumber: "", bankAccount: "" });
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <Panel title="File a redemption" sub="On an approved vendor's behalf">
      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="err">{err}</Notice>}
      <div className="stack" style={{ marginTop: msg || err ? "var(--sp-3)" : 0 }}>
        <div className="form-row">
          <label className="lbl">Vendor</label>
          <select className="field" value={form.vendorAddress} onChange={(e) => setForm({ ...form, vendorAddress: e.target.value })}>
            <option value="">Select a vendor…</option>
            {vendors.map((v) => <option key={v.address} value={v.address}>{v.name} · {VENDOR_CATEGORY_LABELS[v.category] ?? v.category}</option>)}
          </select>
        </div>
        <div className="form-grid">
          <div className="form-row"><label className="lbl">Amount (₹)</label><input className="field" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="decimal" placeholder="e.g. 25000" /></div>
          <div className="form-row"><label className="lbl">ITR / tax reference</label><input className="field" value={form.itrNumber} onChange={(e) => setForm({ ...form, itrNumber: e.target.value })} placeholder="ITR-2026-XXXX" /></div>
        </div>
        <div className="form-row"><label className="lbl">Settlement bank account</label><input className="field" value={form.bankAccount} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} placeholder="HDFC0001-XXXX" /></div>
        <button className="btn btn-primary btn-block" disabled={busy || !form.vendorAddress || !form.amount} onClick={submit}>
          {busy ? "Filing…" : "File redemption"}
        </button>
      </div>
    </Panel>
  );
}

// ========================================================================= vendors
export function VendorsTable({ canEnroll }: { canEnroll: boolean }) {
  const [vendors, setVendors] = useState<VendorView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const reload = () => api.vendors().then(setVendors).catch(() => setVendors([]));
  usePoll(reload, 15000);

  const enroll = async (address: string, name: string) => {
    setBusy(address); setMsg(null); setErr(null);
    try { await api.enrollVendor(address); setMsg(`Enrolled ${name} into all matching schemes.`); reload(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <div className="stack" style={{ gap: "var(--sp-5)" }}>
      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="err">{err}</Notice>}
      {!vendors && <Loading />}
      {vendors?.length === 0 && <EmptyState icon="store" title="No approved vendors" note="Vendors appear here once added to the registry." />}
      {vendors && vendors.length > 0 && (
        <Panel title="Approved vendors" sub={`${vendors.length} in the registry`} flush>
          <table className="table">
            <thead><tr><th>Name</th><th>Category</th><th>City</th><th>Address</th>{canEnroll && <th></th>}</tr></thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.address}>
                  <td><b style={{ color: "var(--ink)" }}>{v.name}</b></td>
                  <td><span className="badge">{VENDOR_CATEGORY_LABELS[v.category] ?? v.category}</span></td>
                  <td>{v.city ?? "—"}</td>
                  <td className="mono caption">{shortAddr(v.address)}</td>
                  {canEnroll && (
                    <td>
                      <button className="btn btn-secondary btn-sm" disabled={busy === v.address} onClick={() => enroll(v.address, v.name)}>
                        {busy === v.address ? "Enrolling…" : "Enroll into schemes"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
