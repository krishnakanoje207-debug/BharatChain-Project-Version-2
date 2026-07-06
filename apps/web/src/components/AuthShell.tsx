import { ReactNode } from "react";
import { Link } from "react-router-dom";
import Emblem from "./Emblem";
import { Icon } from "./icons";
import { useT } from "../lib/i18n";

const POINT_KEYS = ["auth.aside.p1", "auth.aside.p2", "auth.aside.p3"];

export default function AuthShell({ children }: { children: ReactNode }) {
  const { t } = useT();
  return (
    <div className="auth-wrap">
      <aside className="auth-aside">
        <Link to="/" className="brand" style={{ color: "#fff", marginBottom: "var(--sp-6)" }}>
          <Emblem size={46} />
          <div>
            <div className="wm" style={{ color: "#fff", fontWeight: 800, fontSize: "1.4rem" }}>Bharat<span style={{ color: "var(--saffron)" }}>Chain</span></div>
            <div className="motto" style={{ fontFamily: "var(--font-serif)", fontSize: ".7rem", color: "#9fb3d4" }}>{t("brand.portal")}</div>
          </div>
        </Link>
        <h2>{t("auth.aside.h2")}</h2>
        <p>{t("auth.aside.sub")}</p>
        <div className="points">
          {POINT_KEYS.map((k) => (
            <div className="point" key={k}><span className="ic"><Icon.checkCircle size={18} /></span> {t(k)}</div>
          ))}
        </div>
      </aside>
      <div className="auth-main">
        <div className="auth-card">{children}</div>
      </div>
    </div>
  );
}
