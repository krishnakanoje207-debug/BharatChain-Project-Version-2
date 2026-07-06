import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import Assistant from "./Assistant";
import Emblem from "./Emblem";
import { Icon, IconName } from "./icons";
import { useAuth } from "../lib/auth";
import { useT, LANGS, LangCode } from "../lib/i18n";

export interface PortalNavItem { to: string; label: string; icon: IconName; end?: boolean }

function initials(name?: string, phone?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "U";
  }
  return (phone ?? "U").slice(-2);
}

/** Sidebar shell for the authenticated portals (citizen / vendor / admin / RBI). */
export default function PortalLayout({ roleLabel, nav }: { roleLabel: string; nav: PortalNavItem[] }) {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useT();
  const loc = useLocation();
  // Citizen + vendor portals are translated; admin/RBI operator tools stay English.
  const showLang = user?.role === "CITIZEN" || user?.role === "VENDOR";

  const active =
    [...nav].sort((a, b) => b.to.length - a.to.length)
      .find((n) => loc.pathname === n.to || loc.pathname.startsWith(n.to + "/")) ?? nav[0];

  return (
    <div className="portal">
      <aside className="p-side">
        <div className="p-brand">
          <Emblem size={38} />
          <div>
            <div className="wm">Bharat<span className="chain">Chain</span></div>
            <div className="role">{t(roleLabel)}</div>
          </div>
        </div>

        <nav className="p-nav">
          {nav.map((n) => {
            const I = Icon[n.icon];
            return (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) => (isActive ? "active" : "")}>
                <span className="ic"><I size={18} /></span> {t(n.label)}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-foot">
          <div className="p-user">
            <span className="av">{initials(user?.fullName, user?.phone)}</span>
            <div>
              <div className="nm">{user?.fullName ?? "Account"}</div>
              <div className="ph">{user?.phone}</div>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm btn-block" onClick={() => logout()}>
            <Icon.logout size={15} /> {t("acct.logout")}
          </button>
        </div>
      </aside>

      <div className="p-main">
        <div className="p-top">
          <div>
            <h1>{t(active.label)}</h1>
          </div>
          <div className="spacer" />
          {showLang && (
            <label className="p-lang-wrap" title={t("a11y.language")}>
              <Icon.globe size={15} />
              <select className="p-lang" value={lang} aria-label={t("a11y.language")}
                onChange={(e) => setLang(e.target.value as LangCode)}>
                {LANGS.map((l) => <option key={l.code} value={l.code}>{l.native}</option>)}
              </select>
            </label>
          )}
          <Link to="/" className="btn btn-ghost btn-sm"><Icon.external size={15} /> {t("acct.publicSite")}</Link>
        </div>
        <div className="p-content"><Outlet /></div>
      </div>

      {/* Personal assistant lives where the citizen's data lives. */}
      {user?.role === "CITIZEN" && <Assistant />}
    </div>
  );
}
