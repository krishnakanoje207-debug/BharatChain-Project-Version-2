import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, SchemeView } from "../../lib/api";
import { fromWei, inrCompact } from "../../lib/format";
import { Icon, IconName } from "../../components/icons";
import { Loading, Notice } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { useT, schemeI18n } from "../../lib/i18n";

const ALLOWED_VENDORS: Record<string, string[]> = {
  AGRICULTURE: ["AGRI_INPUT"],
  EDUCATION: ["EDU_INSTITUTION", "TECH_STORE"],
  HOUSING: ["HOUSING_MATERIAL"],
  HEALTH: [], EMPLOYMENT: [], SOCIAL_WELFARE: [],
};
const CATEGORY_ICON: Record<string, IconName> = {
  AGRICULTURE: "leaf", EDUCATION: "book", HOUSING: "home", HEALTH: "heart", EMPLOYMENT: "briefcase", SOCIAL_WELFARE: "shield",
};

const STEP_KEYS = ["sd.step1", "sd.step2", "sd.step3", "sd.step4"];

export default function SchemeDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t } = useT();
  const [scheme, setScheme] = useState<SchemeView | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.scheme(Number(id)).then(setScheme).catch((e) => setErr(e.message));
  }, [id]);

  if (err) return <div className="container section"><Notice kind="warn">{t("sd.loadFail", { err })}</Notice></div>;
  if (!scheme) return <div className="container section"><Loading /></div>;

  const I = Icon[CATEGORY_ICON[scheme.category] ?? "grid"];
  const vendors = ALLOWED_VENDORS[scheme.category] ?? [];
  const applyTo = user ? (user.role === "CITIZEN" ? `/citizen/apply?scheme=${scheme.schemeId}` : "/citizen") : "/login";

  return (
    <>
      <section style={{ background: "linear-gradient(165deg,var(--navy) 0%,var(--navy-900) 90%)", color: "#fff", padding: "var(--sp-8) 0" }}>
        <div className="container">
          <Link to="/schemes" style={{ color: "#c2d3ec", fontSize: "var(--t-sm)" }}>{t("sd.allSchemes")}</Link>
          <div className="row" style={{ marginTop: "var(--sp-4)", alignItems: "flex-start", gap: "var(--sp-4)" }}>
            <span className="emblem" style={{ width: 60, height: 60, background: "rgba(255,255,255,.12)", color: "#fff" }}><I size={30} /></span>
            <div style={{ flex: 1 }}>
              <div className="row" style={{ gap: "var(--sp-2)" }}>
                <span className="badge badge-info">{t(`cat.${scheme.category}`)}</span>
                <span className={`badge ${scheme.active ? "badge-ok" : ""}`}>{scheme.active ? t("status.active") : t("status.closed")}</span>
              </div>
              <h1 style={{ color: "#fff", marginTop: 10 }}>{scheme.name}</h1>
              {schemeI18n(t, scheme.schemeId, "ministry", scheme.ministry) &&
                <p style={{ color: "#c2d3ec", marginTop: 6 }}>{schemeI18n(t, scheme.schemeId, "ministry", scheme.ministry)}</p>}
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="grid" style={{ gridTemplateColumns: "1.6fr 1fr", alignItems: "start" }}>
            <div className="stack">
              <div className="card">
                <h3>{t("sd.about")}</h3>
                <p style={{ marginTop: "var(--sp-3)" }}>
                  {schemeI18n(t, scheme.schemeId, "summary", scheme.description) || t("sd.defaultDesc")}
                </p>
                {vendors.length > 0 && (
                  <div style={{ marginTop: "var(--sp-4)" }}>
                    <div className="caption" style={{ marginBottom: 8 }}>{t("sd.spendableAt")}</div>
                    <div className="row" style={{ flexWrap: "wrap", gap: "var(--sp-2)" }}>
                      {vendors.map((v) => <span key={v} className="badge"><Icon.store size={13} /> {t(`vcat.${v}`)}</span>)}
                    </div>
                  </div>
                )}
              </div>

              <div className="card">
                <h3>{t("sd.howTitle")}</h3>
                <div className="stack" style={{ marginTop: "var(--sp-4)" }}>
                  {STEP_KEYS.map((k, i) => (
                    <div key={k} className="row" style={{ alignItems: "flex-start", gap: "var(--sp-4)" }}>
                      <span className="emblem" style={{ width: 34, height: 34, background: "var(--surface-2)", color: "var(--navy)", fontWeight: 800 }}>{i + 1}</span>
                      <div><b>{t(`${k}.t`)}</b><p style={{ fontSize: "var(--t-sm)", marginTop: 2 }}>{t(`${k}.d`)}</p></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="card" style={{ position: "sticky", top: 140 }}>
              <div className="caption">{t("sd.perInstallment")}</div>
              <div style={{ fontSize: "var(--t-3xl)", fontWeight: 800, color: "var(--navy)", lineHeight: 1.1 }}>{scheme.installmentFormatted}</div>
              <div className="stack" style={{ marginTop: "var(--sp-4)", gap: "var(--sp-3)" }}>
                <Fact k={t("sd.outlay")} v={`₹${Number(scheme.fundFormatted).toLocaleString("en-IN")}`} />
                <Fact k={t("sd.disbursedSoFar")} v={inrCompact(fromWei(scheme.disbursed))} />
                <Fact k={t("sd.remaining")} v={scheme.remainingFormatted} />
              </div>
              <Link to={applyTo} className="btn btn-accent btn-lg btn-block" style={{ marginTop: "var(--sp-5)" }}>
                {user ? t("sd.applyCta") : t("sd.signInApply")} →
              </Link>
              <div className="hint center" style={{ marginTop: 10 }}>{t("sd.zkHint")}</div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="row-between" style={{ paddingBottom: "var(--sp-3)", borderBottom: "1px solid var(--border)" }}>
      <span className="caption">{k}</span><b style={{ color: "var(--ink)" }}>{v}</b>
    </div>
  );
}
