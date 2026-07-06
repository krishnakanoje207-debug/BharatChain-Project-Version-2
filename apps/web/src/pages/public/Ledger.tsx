import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, SchemeView } from "../../lib/api";
import { fromWei, inrCompact, num } from "../../lib/format";
import { Icon, IconName } from "../../components/icons";
import { Loading, Notice } from "../../components/ui";
import { useT } from "../../lib/i18n";

const FLOW: { icon: IconName; key: string }[] = [
  { icon: "building", key: "led.flow1" },
  { icon: "users", key: "led.flow2" },
  { icon: "store", key: "led.flow3" },
  { icon: "refresh", key: "led.flow4" },
];

export default function Ledger() {
  const { t } = useT();
  const [schemes, setSchemes] = useState<SchemeView[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const load = () => api.allSchemes().then(setSchemes).catch((e) => setErr(e.message));
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);

  const outlay = schemes ? schemes.reduce((s, x) => s + (Number(x.fundFormatted) || 0), 0) : 0;
  const disbursed = schemes ? schemes.reduce((s, x) => s + fromWei(x.disbursed), 0) : 0;
  const pct = outlay > 0 ? Math.min(100, (disbursed / outlay) * 100) : 0;

  return (
    <>
      <section style={{ background: "linear-gradient(165deg,var(--navy) 0%,var(--navy-900) 90%)", color: "#fff", padding: "var(--sp-8) 0" }}>
        <div className="container">
          <div className="eyebrow" style={{ color: "#ffce9e" }}><span className="badge badge-ok" style={{ marginRight: 8 }}><span className="dot" /> {t("led.live")}</span> {t("nav.ledger")}</div>
          <h1 style={{ color: "#fff", marginTop: 12 }}>{t("led.title")}</h1>
          <p style={{ color: "#c2d3ec", marginTop: 12, maxWidth: "64ch", fontSize: "var(--t-lg)" }}>
            {t("led.sub")}
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          {err && <Notice kind="warn">{t("led.loadFail", { err })}</Notice>}
          {!schemes && !err && <Loading />}

          {schemes && (
            <>
              <div className="grid cols-3" style={{ marginBottom: "var(--sp-6)" }}>
                <Metric icon="rupee" value={inrCompact(disbursed)} label={t("led.mDisbursed")} />
                <Metric icon="chart" value={inrCompact(outlay)} label={t("led.mOutlay")} />
                <Metric icon="shield" value="0" label={t("led.mLeakage")} />
              </div>

              <div className="card" style={{ marginBottom: "var(--sp-6)" }}>
                <div className="row-between">
                  <h3>{t("led.overall")}</h3>
                  <span className="badge badge-ok"><span className="dot" /> {t("led.pctDisbursed", { pct: pct.toFixed(1) })}</span>
                </div>
                <div style={{ height: 14, background: "var(--surface-2)", borderRadius: 999, marginTop: "var(--sp-4)", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,var(--saffron),var(--green))", borderRadius: 999, transition: "width .6s" }} />
                </div>
                <div className="row-between" style={{ marginTop: 10 }}>
                  <span className="caption">{t("led.xDisbursed", { x: inrCompact(disbursed) })}</span>
                  <span className="caption">{t("led.xSanctioned", { x: inrCompact(outlay) })}</span>
                </div>
              </div>

              <h3 style={{ marginBottom: "var(--sp-4)" }}>{t("led.byScheme")}</h3>
              <div className="panel panel-table">
                <table className="table">
                  <thead>
                    <tr><th>{t("led.th.scheme")}</th><th>{t("led.th.sector")}</th><th>{t("led.th.installment")}</th><th>{t("led.th.disbursed")}</th><th>{t("led.th.outlay")}</th><th style={{ width: 180 }}>{t("led.th.progress")}</th></tr>
                  </thead>
                  <tbody>
                    {schemes.map((s) => {
                      const d = fromWei(s.disbursed); const o = Number(s.fundFormatted) || 0;
                      const p = o > 0 ? Math.min(100, (d / o) * 100) : 0;
                      return (
                        <tr key={s.schemeId}>
                          <td><Link to={`/schemes/${s.schemeId}`} style={{ fontWeight: 600, color: "var(--ink)" }}>{s.name}</Link></td>
                          <td>{t(`cat.${s.category}`)}</td>
                          <td>{s.installmentFormatted}</td>
                          <td><b style={{ color: "var(--navy)" }}>{inrCompact(d)}</b></td>
                          <td>₹{num(o)}</td>
                          <td>
                            <div style={{ height: 8, background: "var(--surface-2)", borderRadius: 999, overflow: "hidden" }}>
                              <div style={{ width: `${p}%`, height: "100%", background: "var(--green)" }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="card" style={{ marginTop: "var(--sp-7)" }}>
                <h3>{t("led.flowTitle")}</h3>
                <p style={{ marginTop: 6 }}>{t("led.flowSub")}</p>
                <div className="grid cols-4" style={{ marginTop: "var(--sp-5)" }}>
                  {FLOW.map((f, i) => {
                    const FI = Icon[f.icon];
                    return (
                      <div key={f.key} className="row" style={{ alignItems: "flex-start", gap: "var(--sp-3)" }}>
                        <span className="emblem" style={{ width: 40, height: 40, background: "var(--surface-2)", color: "var(--navy)" }}><FI size={20} /></span>
                        <div><b>{i + 1}. {t(`${f.key}.t`)}</b><p style={{ fontSize: "var(--t-sm)", marginTop: 2 }}>{t(`${f.key}.d`)}</p></div>
                      </div>
                    );
                  })}
                </div>
                <Notice>{t("led.portalNote")}</Notice>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}

function Metric({ icon, value, label }: { icon: IconName; value: string; label: string }) {
  const I = Icon[icon];
  return (
    <div className="kpi">
      <span className="ic"><I size={22} /></span>
      <div className="v">{value}</div>
      <div className="k">{label}</div>
    </div>
  );
}
