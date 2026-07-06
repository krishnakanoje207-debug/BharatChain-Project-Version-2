import { Link } from "react-router-dom";
import { Icon, IconName } from "../../components/icons";
import { useT } from "../../lib/i18n";

const PILLARS: { icon: IconName; key: string }[] = [
  { icon: "shield", key: "abt.pillar1" },
  { icon: "ledger", key: "abt.pillar2" },
  { icon: "lock", key: "abt.pillar3" },
  { icon: "store", key: "abt.pillar4" },
];

const ROLES: { icon: IconName; key: string; to: string }[] = [
  { icon: "user", key: "abt.role1", to: "/signup" },
  { icon: "store", key: "abt.role2", to: "/login" },
  { icon: "layers", key: "abt.role3", to: "/login" },
  { icon: "building", key: "abt.role4", to: "/login" },
];

const STEP_KEYS = ["abt.step1", "abt.step2", "abt.step3", "abt.step4", "abt.step5", "abt.step6"];

export default function About() {
  const { t } = useT();
  return (
    <>
      <section style={{ background: "linear-gradient(165deg,var(--navy) 0%,var(--navy-900) 90%)", color: "#fff", padding: "var(--sp-9) 0" }}>
        <div className="container">
          <div className="eyebrow" style={{ color: "#ffce9e" }}>{t("common.howItWorks")}</div>
          <h1 style={{ color: "#fff", marginTop: 12, maxWidth: "18ch" }}>{t("abt.title")}</h1>
          <p style={{ color: "#c2d3ec", marginTop: 14, maxWidth: "64ch", fontSize: "var(--t-lg)" }}>
            {t("abt.sub")}
          </p>
          <div className="row" style={{ marginTop: "var(--sp-6)", gap: "var(--sp-3)" }}>
            <Link to="/schemes" className="btn btn-accent btn-lg">{t("abt.browse")}</Link>
            <Link to="/ledger" className="btn btn-lg" style={{ background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.28)" }}>{t("abt.seeLedger")}</Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="head-c"><h2>{t("abt.principles")}</h2><div className="uline" /></div>
          <div className="grid cols-4">
            {PILLARS.map((p) => {
              const I = Icon[p.icon];
              return (
                <div key={p.key} className="card">
                  <span className="emblem" style={{ width: 48, height: 48, background: "var(--surface-2)", color: "var(--navy)" }}><I size={24} /></span>
                  <h3 style={{ marginTop: "var(--sp-3)", fontSize: "var(--t-lg)" }}>{t(`${p.key}.t`)}</h3>
                  <p style={{ marginTop: 8, fontSize: "var(--t-sm)" }}>{t(`${p.key}.d`)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section" style={{ background: "var(--surface)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="container">
          <div className="head-c"><h2>{t("abt.lifecycle")}</h2><div className="uline" /><p>{t("abt.lifecycleSub")}</p></div>
          <div className="grid cols-2" style={{ gap: "var(--sp-4)" }}>
            {STEP_KEYS.map((k, i) => (
              <div key={k} className="card row" style={{ alignItems: "flex-start", gap: "var(--sp-4)" }}>
                <span className="emblem" style={{ width: 40, height: 40, background: "var(--navy)", color: "#fff", fontWeight: 800, flex: "none" }}>{i + 1}</span>
                <div><b style={{ color: "var(--ink)" }}>{t(`${k}.t`)}</b><p style={{ fontSize: "var(--t-sm)", marginTop: 4 }}>{t(`${k}.d`)}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="head-c"><h2>{t("abt.participants")}</h2><div className="uline" /></div>
          <div className="grid cols-4">
            {ROLES.map((r) => {
              const I = Icon[r.icon];
              return (
                <Link key={r.key} to={r.to} className="card card-hover">
                  <span className="emblem" style={{ width: 48, height: 48, background: "var(--surface-2)", color: "var(--navy)" }}><I size={24} /></span>
                  <h3 style={{ marginTop: "var(--sp-3)", fontSize: "var(--t-lg)" }}>{t(`${r.key}.t`)}</h3>
                  <p style={{ marginTop: 8, fontSize: "var(--t-sm)" }}>{t(`${r.key}.d`)}</p>
                  <div style={{ marginTop: "var(--sp-3)", color: "var(--link)", fontWeight: 600, fontSize: "var(--t-sm)" }}>{t("abt.getStarted")}</div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
