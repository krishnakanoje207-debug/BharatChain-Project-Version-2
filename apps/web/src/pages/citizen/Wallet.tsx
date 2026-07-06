import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Entitlement, VendorView } from "../../lib/api";
import { usePoll } from "../../lib/usePoll";
import { useT } from "../../lib/i18n";
import { inr } from "../../lib/format";
import { Panel, Notice, EmptyState } from "../../components/ui";
import { Icon } from "../../components/icons";

export default function Wallet() {
  const { t } = useT();
  const [ent, setEnt] = useState<Entitlement[] | null>(null);
  const [schemeId, setSchemeId] = useState<number | "">("");
  const [vendors, setVendors] = useState<VendorView[]>([]);
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  usePoll(() => { api.entitlements().then(setEnt).catch(() => setEnt([])); });

  useEffect(() => {
    setVendor("");
    if (schemeId === "") { setVendors([]); return; }
    api.vendors(Number(schemeId)).then(setVendors).catch(() => setVendors([]));
  }, [schemeId]);

  const list = ent ?? [];
  const total = list.reduce((s, e) => s + (Number(e.entitlementFormatted) || 0), 0);
  const balance = list.find((e) => e.schemeId === schemeId)?.entitlementFormatted;

  const pay = async () => {
    setErr(null); setOk(null); setBusy(true);
    try {
      const p = await api.pay({ schemeId: Number(schemeId), vendorAddress: vendor, amount });
      setOk(t("cz.wallet.paidOk", { amt: inr(Number(p.amountFormatted)), vendor: p.vendorName ?? t("col.vendor") }));
      setAmount("");
      api.entitlements().then(setEnt).catch(() => undefined);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="stack" style={{ gap: "var(--sp-6)" }}>
      <div className="card" style={{ background: "linear-gradient(135deg,var(--navy) 0%,var(--navy-900) 100%)", color: "#fff", border: 0 }}>
        <div className="row-between">
          <div>
            <div style={{ color: "#c2d3ec", fontSize: "var(--t-sm)" }}>{t("cz.wallet.totalBalance")}</div>
            <div style={{ fontSize: "var(--t-4xl)", fontWeight: 800, lineHeight: 1.1, marginTop: 6 }}>
              {inr(total)} <span style={{ fontSize: "var(--t-lg)", fontWeight: 600, color: "var(--saffron)" }}>e₹</span>
            </div>
          </div>
          <span className="emblem" style={{ width: 56, height: 56, background: "rgba(255,255,255,.12)", color: "#fff" }}><Icon.wallet size={28} /></span>
        </div>
        <div style={{ color: "#9fb3d4", fontSize: "var(--t-sm)", marginTop: "var(--sp-3)" }}>{t("cz.wallet.digitalNote")}</div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", alignItems: "start" }}>
        <Panel title={t("cz.wallet.schemeBalances")}>
          {list.length === 0 && (
            <EmptyState icon="wallet" title={t("cz.wallet.noBalanceTitle")}
              note={t("cz.wallet.noBalanceNote")}
              action={<Link to="/citizen/apply" className="btn btn-primary">{t("cz.wallet.applyScheme")}</Link>} />
          )}
          <div className="stack" style={{ gap: "var(--sp-3)" }}>
            {list.map((e) => (
              <div key={e.schemeId} className="card" style={{ padding: "var(--sp-4)" }}>
                <div className="caption">{e.schemeName}</div>
                <div style={{ fontSize: "var(--t-2xl)", fontWeight: 800, color: "var(--navy)" }}>{inr(Number(e.entitlementFormatted))}</div>
                <div className="caption">{t("cz.wallet.spendableHere")}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={t("cz.wallet.payVendor")} sub={t("cz.wallet.paySub")}>
          {err && <Notice kind="err">{err}</Notice>}
          {ok && <Notice kind="ok">{ok}</Notice>}
          {list.length === 0 && <Notice>{t("cz.wallet.noBalanceSpend")}</Notice>}

          {list.length > 0 && (
            <div className="stack" style={{ marginTop: ok || err ? "var(--sp-3)" : 0 }}>
              <div className="form-row">
                <label className="lbl">{t("cz.wallet.fromScheme")}</label>
                <select className="field" value={schemeId} onChange={(e) => setSchemeId(e.target.value === "" ? "" : Number(e.target.value))}>
                  <option value="">{t("cz.wallet.selectScheme")}</option>
                  {list.map((e) => <option key={e.schemeId} value={e.schemeId}>{e.schemeName} — balance {inr(Number(e.entitlementFormatted))}</option>)}
                </select>
              </div>

              {schemeId !== "" && (
                <>
                  <div className="form-row">
                    <label className="lbl">{t("cz.wallet.approvedVendor")}</label>
                    <select className="field" value={vendor} onChange={(e) => setVendor(e.target.value)}>
                      <option value="">{t("cz.wallet.selectVendor")}</option>
                      {vendors.map((v) => <option key={v.address} value={v.address}>{v.name}{v.city ? ` · ${v.city}` : ""}</option>)}
                    </select>
                    {vendors.length === 0 && <div className="hint">{t("cz.wallet.noVendors")}</div>}
                  </div>
                  <div className="form-row">
                    <label className="lbl">{t("cz.wallet.amount")} <span className="caption">· {t("cz.wallet.balanceLabel")} {balance ? inr(Number(balance)) : "—"}</span></label>
                    <input className="field" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 4000" inputMode="decimal" />
                  </div>
                  <button className="btn btn-accent btn-lg btn-block" disabled={busy || !vendor || !amount} onClick={pay}>
                    {busy ? t("cz.wallet.paying") : <><Icon.send size={16} /> {t("cz.wallet.payBtn")}</>}
                  </button>
                </>
              )}
              <Link to="/citizen/history" className="btn btn-ghost btn-sm btn-block">{t("cz.wallet.viewHistory")}</Link>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
