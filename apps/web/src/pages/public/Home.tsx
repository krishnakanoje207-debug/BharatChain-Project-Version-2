import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, SchemeView } from "../../lib/api";
import { fromWei, inrCompact, num, SCHEME_CATEGORY_LABELS } from "../../lib/format";
import { useT, schemeI18n } from "../../lib/i18n";
import { Icon, IconName } from "../../components/icons";
import Emblem from "../../components/Emblem";
import { Loading, Notice } from "../../components/ui";

const CATEGORIES: { key: string; icon: IconName }[] = [
  { key: "AGRICULTURE", icon: "leaf" },
  { key: "EDUCATION", icon: "book" },
  { key: "HOUSING", icon: "home" },
  { key: "HEALTH", icon: "heart" },
  { key: "EMPLOYMENT", icon: "briefcase" },
  { key: "SOCIAL_WELFARE", icon: "shield" },
];

const ANNOUNCEMENTS: { src: string; key: string; to?: string }[] = [
  { src: "MoA", key: "home.ann.1" },
  { src: "MoE", key: "home.ann.2" },
  { src: "LDGR", key: "home.ann.3", to: "/ledger" },
  { src: "RBI", key: "home.ann.4" },
];

const SPOTLIGHT = ["home.spot.1", "home.spot.2", "home.spot.3", "home.spot.4"];

export default function Home() {
  const nav = useNavigate();
  const { t } = useT();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [schemes, setSchemes] = useState<SchemeView[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const load = () => api.allSchemes().then(setSchemes).catch((e) => setErr(e.message));
    load();
    const poll = setInterval(load, 8000); // disbursed figures tick up live
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % 3), 6000);
    return () => clearInterval(id);
  }, []);

  const active = useMemo(() => schemes?.filter((s) => s.active) ?? [], [schemes]);
  const outlay = schemes ? schemes.reduce((s, x) => s + (Number(x.fundFormatted) || 0), 0) : 0;
  const disbursed = schemes ? schemes.reduce((s, x) => s + fromWei(x.disbursed), 0) : 0;
  const sectors = new Set(active.map((s) => s.category)).size;
  const featured = active[0];

  const tickerItems = active.length
    ? active.flatMap((s) => [
        { who: s.name, amt: s.installmentFormatted },
        { who: t(`cat.${s.category}`), amt: inrCompact(fromWei(s.disbursed)) },
      ])
    : [];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (cat) p.set("category", cat);
    nav(`/schemes${p.toString() ? `?${p}` : ""}`);
  };

  return (
    <>
      {/* ===== Hero ===== */}
      <section className="hero">
        <div className="slides">
          {["g1", "g2", "g3"].map((g, i) => <div key={g} className={`slide ${g} ${i === slide ? "on" : ""}`} />)}
        </div>
        <div className="inner">
          <Emblem size={76} className="emblem-lg" />
          <div className="wordmark">Bharat<span className="chain">Chain</span><span className="beta">BETA</span></div>
          <div className="uline" />
          <div className="pt">{t("home.hero.title")}</div>
          <div className="ps">{t("home.hero.sub")}</div>

          <form className="search" onSubmit={submit}>
            <input className="field" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder={t("home.hero.searchPh")} aria-label={t("search.go")} />
            <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t("nav.schemes")}>
              <option value="">{t("common.viewAll")}</option>
              {Object.keys(SCHEME_CATEGORY_LABELS).map((k) => <option key={k} value={k}>{t(`cat.${k}`)}</option>)}
            </select>
            <button className="btn btn-accent btn-lg" type="submit">{t("search.go")}</button>
          </form>

          <div className="trending">
            <span className="lead">{t("home.trending")}</span>
            {active.slice(0, 3).map((s) => (
              <Link key={s.schemeId} to={`/schemes/${s.schemeId}`} className="chip">{s.name}</Link>
            ))}
            <Link to="/citizen" className="chip">{t("foot.track")}</Link>
          </div>

          <div style={{ marginTop: "var(--sp-5)" }}>
            <Link to="/ledger" className="btn btn-lg" style={{ background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.28)" }}>
              <Icon.ledger size={18} /> {t("home.hero.ledger")} →
            </Link>
          </div>
        </div>
        <div className="dots">
          {[0, 1, 2].map((i) => <button key={i} className={i === slide ? "on" : ""} onClick={() => setSlide(i)} aria-label={`Slide ${i + 1}`} />)}
        </div>
      </section>

      {/* ===== Floating stats ===== */}
      <div className="stats-wrap">
        <div className="container-wide">
          <div className="stats-card">
            <Stat icon="rupee" value={schemes ? inrCompact(disbursed) : "—"} label={t("home.stat.disbursed")} />
            <Stat icon="grid" value={schemes ? num(active.length) : "—"} label={t("home.stat.active")} />
            <Stat icon="chart" value={schemes ? inrCompact(outlay) : "—"} label={t("home.stat.outlay")} />
            <Stat icon="layers" value={schemes ? String(sectors) : "—"} label={t("home.stat.sectors")} />
            <Stat icon="shield" value="100%" label={t("home.stat.onledger")} />
          </div>
        </div>
      </div>

      {/* ===== Live ticker ===== */}
      {tickerItems.length > 0 && (
        <div className="ticker">
          <div className="container-wide">
            <span className="tag"><span className="live" /> {t("home.ticker.live")}</span>
            <div className="vp">
              <div className="track">
                {[...tickerItems, ...tickerItems].map((item, i) => (
                  <span className="tx" key={i}><b>{item.who}</b> · {item.amt} <span className="ok">{t("home.ticker.settled")}</span></span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Citizen services ===== */}
      <section className="section container-wide">
        <div className="services">
          <div className="svc-panel">
            <h2>{t("home.svc.title")}</h2>
            <div className="uline" />
            <div className="svc-tiles">
              <Link to="/schemes" className="svc-tile"><span className="ic"><Icon.home size={26} /></span><div className="n">{schemes ? num(active.length) : "—"}</div><div className="t">{t("home.svc.schemes")}</div></Link>
              <Link to="/citizen" className="svc-tile"><span className="ic"><Icon.clock size={26} /></span><div className="n">{t("home.svc.track")}</div><div className="t">{t("home.svc.applications")}</div></Link>
              <Link to="/citizen/wallet" className="svc-tile"><span className="ic"><Icon.wallet size={26} /></span><div className="n">e₹</div><div className="t">{t("home.svc.wallet")}</div></Link>
              <Link to="/about" className="svc-tile"><span className="ic"><Icon.shield size={26} /></span><div className="n">ZK</div><div className="t">{t("home.svc.eligibility")}</div></Link>
            </div>
            <div className="cta">
              <span>{t("home.svc.cta")}</span>
              <Link to="/schemes" className="btn btn-accent btn-sm">{t("home.svc.viewAll")}</Link>
            </div>
          </div>

          <div className="svc-carousel">
            {!schemes && !err && <Loading />}
            {err && <Notice kind="warn">{t("home.loadFail", { err })}</Notice>}
            <div className="svc-grid">
              {active.slice(0, 4).map((s, i) => {
                const grad = ["linear-gradient(135deg,#138808,#0f7106)", "linear-gradient(135deg,#1f6feb,#14457a)", "linear-gradient(135deg,#ff9933,#e87f1e)", "linear-gradient(135deg,#0b2e59,#16487f)"][i % 4];
                return (
                  <Link key={s.schemeId} to={`/schemes/${s.schemeId}`} className="svc-item">
                    <div className="thumb" style={{ background: grad }}>
                      <span className="badge tag">{t(`cat.${s.category}`)}</span>
                      {s.name}
                    </div>
                    <div className="body"><h4>{s.name}</h4><p>{t("home.svc.installmentLine", { amt: s.installmentFormatted })}</p></div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ===== Categories ===== */}
      <section className="section" style={{ background: "var(--surface)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="container-wide">
          <div className="head-c">
            <h2>{t("home.cat.title")}</h2><div className="uline" />
            <p>{t("home.cat.sub")}</p>
          </div>
          <div className="cat-grid">
            {CATEGORIES.map((c) => {
              const I = Icon[c.icon];
              return (
                <Link key={c.key} to={`/schemes?category=${c.key}`} className="cat">
                  <span className="ic"><I size={26} /></span>
                  <div><h3>{t(`cat.${c.key}`)}</h3><p>{t(`home.catblurb.${c.key}`)}</p></div>
                </Link>
              );
            })}
          </div>
          <div className="center" style={{ marginTop: "var(--sp-6)" }}>
            <Link to="/schemes" className="btn btn-secondary">{t("common.viewAll")}</Link>
          </div>
        </div>
      </section>

      {/* ===== Featured banner ===== */}
      {featured && (
        <section className="section container-wide">
          <div className="banner">
            <div className="inner">
              <div className="ph">[ {t(`cat.${featured.category}`)} ]<br />{t("home.feat.ph")}</div>
              <div>
                <div className="kicker">{t("home.feat.kicker")}</div>
                <h2>{featured.name}</h2>
                <p style={{ color: "#c2d3ec", marginTop: "var(--sp-2)" }}>
                  {schemeI18n(t, featured.schemeId, "summary", featured.description) || t("home.feat.defaultDesc")}
                </p>
                <div className="metrics">
                  <div><div className="v">{featured.installmentFormatted}</div><div className="k">{t("home.feat.m1")}</div></div>
                  <div><div className="v">{inrCompact(fromWei(featured.disbursed))}</div><div className="k">{t("home.feat.m2")}</div></div>
                  <div><div className="v">ZK</div><div className="k">{t("home.feat.m3")}</div></div>
                  <div><div className="v">0</div><div className="k">{t("home.feat.m4")}</div></div>
                </div>
                <Link to={`/schemes/${featured.schemeId}`} className="btn btn-accent">{t("home.feat.cta")}</Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ===== Announcements + spotlight ===== */}
      <section className="section" style={{ background: "var(--surface)", borderTop: "1px solid var(--border)" }}>
        <div className="container-wide">
          <div className="two-col">
            <div>
              <div className="col-head"><h2>{t("home.ann.title")}</h2><div className="uline" /><div className="sub">{t("home.ann.sub")}</div></div>
              {ANNOUNCEMENTS.map((a) => (
                <Link key={a.key} to={a.to ?? "#"} className="feed-item" onClick={(e) => { if (!a.to) e.preventDefault(); }}>
                  <span className="src">{a.src}</span>
                  <div style={{ flex: 1 }}>
                    <div className="meta"><span>{t(`${a.key}.who`)}</span><span>{t(`${a.key}.when`)}</span></div>
                    <div className="ttl">{t(`${a.key}.title`)}</div>
                  </div>
                </Link>
              ))}
            </div>
            <div>
              <div className="col-head"><h2>{t("home.spot.title")}</h2><div className="uline" /><div className="sub">{t("home.spot.sub")}</div></div>
              <div className="spotlight">
                <div className="feature">
                  <span className="badge badge-info" style={{ marginBottom: 8 }}>{t("home.spot.feature.badge")}</span>
                  <h3>{t("home.spot.feature.title")}</h3>
                  <p>{t("home.spot.feature.body")}</p>
                  <Link to="/ledger" className="btn btn-accent btn-sm" style={{ marginTop: "var(--sp-4)" }}>{t("home.spot.feature.cta")}</Link>
                </div>
                <div className="list">
                  {SPOTLIGHT.map((k) => (
                    <Link key={k} to="/ledger" className="lrow"><div className="when">{t(`${k}.when`)}</div><div className="t">{t(`${k}.t`)}</div></Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Explore ===== */}
      <section className="section container-wide">
        <div className="head-c"><h2>{t("home.explore.title")}</h2><div className="uline" /></div>
        <div className="cat-grid">
          {([["home.explore.ledger", "ledger", "/ledger"], ["home.explore.flow", "chart", "/ledger"], ["home.explore.vendors", "store", "/ledger"], ["home.explore.how", "scale", "/about"]] as [string, IconName, string][]).map(([key, ic, to]) => {
            const I = Icon[ic];
            return (
              <Link key={key} to={to} className="cat" style={{ alignItems: "center" }}>
                <span className="ic"><I size={26} /></span><div><h3>{t(key)}</h3></div>
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}

function Stat({ icon, value, label }: { icon: IconName; value: string; label: string }) {
  const I = Icon[icon];
  return (
    <div className="stat-cell">
      <span className="ic"><I size={22} /></span>
      <div><div className="num">{value}</div><div className="lbl">{label}</div></div>
    </div>
  );
}
