import { FormEvent, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import Emblem from "./Emblem";
import { Icon } from "./icons";
import { useAuth, homeForRole } from "../lib/auth";
import { useA11y } from "./a11y";
import { useT, LANGS, LangCode } from "../lib/i18n";

function A11yStrip() {
  const { size, setSize, contrast, setContrast } = useA11y();
  const { t, lang, setLang } = useT();
  return (
    <div className="util">
      <div className="container-wide">
        <span className="gov">{t("gov.in")} <span className="sep">|</span> {t("gov.tagline")}</span>
        <div className="a11y">
          <span className="lbl-min">{t("a11y.textSize")}</span>
          <button className={size === "sm" ? "on" : ""} onClick={() => setSize("sm")} title="A−">A−</button>
          <button className={size === "" ? "on" : ""} onClick={() => setSize("")} title="A">A</button>
          <button className={size === "lg" ? "on" : ""} onClick={() => setSize("lg")} title="A+">A+</button>
          <span className="sep">|</span>
          <button className={contrast ? "on" : ""} onClick={() => setContrast(!contrast)} aria-pressed={contrast}>◐ {t("a11y.contrast")}</button>
          <span className="sep">|</span>
          <span className="lbl-min"><Icon.globe size={13} /> {t("a11y.language")}</span>
          <select className="lang-pick" value={lang} aria-label={t("a11y.language")}
            onChange={(e) => setLang(e.target.value as LangCode)}>
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.native}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

export default function Masthead() {
  const { user, logout } = useAuth();
  const { t } = useT();
  const nav = useNavigate();
  const [q, setQ] = useState("");

  const search = (e: FormEvent) => {
    e.preventDefault();
    nav(`/schemes${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  };

  return (
    <>
      <hr className="tricolor" />
      <A11yStrip />

      <header className="masthead">
        <div className="container-wide">
          <Link to="/" className="brand">
            <Emblem size={46} />
            <div>
              <div className="wm">Bharat<span className="chain">Chain</span><span className="beta">BETA</span></div>
              <div className="motto">सत्यमेव जयते · {t("brand.portal")}</div>
            </div>
          </Link>

          <form className="m-search" onSubmit={search} role="search">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search.ph")} aria-label={t("search.go")} />
            <button className="go" type="submit">{t("search.go")}</button>
          </form>

          <div className="m-tools">
            <span className="flag-mark" title="India"><i className="s" /><i className="w" /><i className="g" /></span>
          </div>
        </div>
      </header>

      <nav className="subnav">
        <div className="container-wide">
          <NavLink to="/" end>{t("nav.home")}</NavLink>
          <NavLink to="/schemes">{t("nav.schemes")}</NavLink>
          <NavLink to="/ledger">{t("nav.ledger")}</NavLink>
          <NavLink to="/about">{t("nav.about")}</NavLink>
          <div className="spacer" />
          {user ? (
            <div className="acct">
              <Link to={homeForRole(user.role)} className="btn btn-accent btn-sm">
                <Icon.grid size={15} /> {t("acct.dashboard")}
              </Link>
              <div className="who">
                <b>{user.fullName ?? user.phone}</b>
                <small>{t(`role.${user.role}`)}</small>
              </div>
              <button className="btn btn-ghost btn-sm" style={{ color: "#c8d6ea" }} onClick={() => logout()} title={t("acct.logout")}>
                <Icon.logout size={15} />
              </button>
            </div>
          ) : (
            <div className="acct">
              <Link to="/login" className="btn btn-ghost btn-sm" style={{ color: "#dfe8f5" }}>{t("acct.login")}</Link>
              <Link to="/signup" className="btn btn-accent btn-sm">{t("acct.register")}</Link>
            </div>
          )}
        </div>
      </nav>
    </>
  );
}
