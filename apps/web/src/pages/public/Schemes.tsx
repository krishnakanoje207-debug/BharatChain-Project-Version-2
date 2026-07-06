import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, SchemeGroup } from "../../lib/api";
import { SCHEME_CATEGORY_LABELS } from "../../lib/format";
import { SchemeCard, Loading, Notice, EmptyState } from "../../components/ui";
import { Icon } from "../../components/icons";
import { useT } from "../../lib/i18n";

/**
 * Real citizen→vendor Indian government programmes queued for on-chain
 * onboarding. Informational only — no eligibility logic exists for these yet;
 * names are proper nouns and stay untranslated, descriptions are i18n keys.
 */
const UPCOMING_SCHEMES = [
  { name: "PM Vishwakarma", ministry: "Ministry of MSME", key: "sch.up.vishwakarma" },
  { name: "PM-KUSUM", ministry: "Ministry of New & Renewable Energy", key: "sch.up.kusum" },
  { name: "PM Surya Ghar: Muft Bijli Yojana", ministry: "Ministry of New & Renewable Energy", key: "sch.up.suryaghar" },
  { name: "Ayushman Bharat PM-JAY", ministry: "Ministry of Health & Family Welfare", key: "sch.up.pmjay" },
  { name: "PDS / One Nation One Ration Card", ministry: "Ministry of Consumer Affairs, Food & PD", key: "sch.up.pds" },
  { name: "PM Ujjwala Yojana", ministry: "Ministry of Petroleum & Natural Gas", key: "sch.up.ujjwala" },
];

export default function Schemes() {
  const { t } = useT();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const category = params.get("category") ?? "";
  const [term, setTerm] = useState(q);
  const [groups, setGroups] = useState<SchemeGroup[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setTerm(q); }, [q]);

  useEffect(() => {
    setGroups(null); setErr(null);
    api.browseSchemes(q || undefined, category || undefined).then(setGroups).catch((e) => setErr(e.message));
  }, [q, category]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = new URLSearchParams(params);
    if (term) p.set("q", term); else p.delete("q");
    setParams(p, { replace: true });
  };

  const setCategory = (c: string) => {
    const p = new URLSearchParams(params);
    if (c) p.set("category", c); else p.delete("category");
    setParams(p, { replace: true });
  };

  const total = groups?.reduce((n, g) => n + g.schemes.length, 0) ?? 0;

  return (
    <>
      <section style={{ background: "linear-gradient(165deg,var(--navy) 0%,var(--navy-900) 90%)", color: "#fff", padding: "var(--sp-8) 0" }}>
        <div className="container">
          <div className="eyebrow" style={{ color: "#ffce9e" }}>{t("nav.schemes")}</div>
          <h1 style={{ color: "#fff", marginTop: 12 }}>{t("sch.title")}</h1>
          <p style={{ color: "#c2d3ec", marginTop: 12, maxWidth: "60ch", fontSize: "var(--t-lg)" }}>
            {t("sch.sub")}
          </p>
          <form className="search" onSubmit={submit} style={{ marginTop: "var(--sp-5)", maxWidth: 720 }}>
            <input className="field" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t("sch.searchPh")} aria-label={t("search.go")} />
            <button className="btn btn-accent btn-lg" type="submit"><Icon.search size={18} /> {t("search.go")}</button>
          </form>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="row" style={{ flexWrap: "wrap", gap: "var(--sp-2)", marginBottom: "var(--sp-6)" }}>
            <button className={`chip ${category === "" ? "chip-active" : ""}`} onClick={() => setCategory("")}>{t("sch.allSectors")}</button>
            {Object.keys(SCHEME_CATEGORY_LABELS).map((k) => (
              <button key={k} className={`chip ${category === k ? "chip-active" : ""}`} onClick={() => setCategory(k)}>{t(`cat.${k}`)}</button>
            ))}
          </div>

          {!groups && !err && <Loading label={t("sch.loading")} />}
          {err && <Notice kind="warn">{t("sch.loadFail", { err })}</Notice>}
          {groups && total === 0 && <EmptyState icon="search" title={t("sch.noneTitle")} note={t("sch.noneNote")} />}

          {groups?.map((g) => (
            <div key={g.category} style={{ marginBottom: "var(--sp-7)" }}>
              <div className="row-between" style={{ marginBottom: "var(--sp-4)" }}>
                <h2 style={{ fontSize: "var(--t-2xl)" }}>{t(`cat.${g.category}`)}</h2>
                <span className="badge">{g.schemes.length === 1 ? t("sch.oneScheme") : t("sch.nSchemes", { n: g.schemes.length })}</span>
              </div>
              <div className="grid cols-3">
                {g.schemes.map((s) => <SchemeCard key={s.schemeId} scheme={s} />)}
              </div>
            </div>
          ))}

          {!q && !category && (
            <div style={{ marginTop: "var(--sp-8)" }}>
              <div className="row-between" style={{ marginBottom: "var(--sp-2)" }}>
                <h2 style={{ fontSize: "var(--t-2xl)" }}>{t("sch.upTitle")}</h2>
                <span className="badge">{t("sch.nSchemes", { n: UPCOMING_SCHEMES.length })}</span>
              </div>
              <p className="caption" style={{ maxWidth: "70ch", marginBottom: "var(--sp-4)" }}>{t("sch.upSub")}</p>
              <div className="grid cols-3">
                {UPCOMING_SCHEMES.map((u) => (
                  <div key={u.name} className="card" style={{ padding: "var(--sp-5)", opacity: 0.9 }}>
                    <div className="row-between" style={{ marginBottom: "var(--sp-2)", alignItems: "flex-start" }}>
                      <b style={{ color: "var(--ink)" }}>{u.name}</b>
                      <span className="badge" style={{ flexShrink: 0 }}>{t("sch.upBadge")}</span>
                    </div>
                    <div className="caption" style={{ marginBottom: "var(--sp-2)" }}>{u.ministry}</div>
                    <p style={{ fontSize: "var(--t-sm)" }}>{t(u.key)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
