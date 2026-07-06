import { Link } from "react-router-dom";
import Emblem from "./Emblem";
import { useT } from "../lib/i18n";

const PARTNERS = [
  ["RTI", "Right to Information"], ["e₹", "Digital Rupee · RBI"], ["UID", "Aadhaar"],
  ["DL", "DigiLocker"], ["DI", "Digital India"], ["MG", "MyGov"], ["U", "UMANG"],
];

export default function Footer() {
  const { t } = useT();
  return (
    <footer className="site">
      <div className="partners">
        <div className="container-wide">
          {PARTNERS.map(([sq, label]) => (
            <span className="partner" key={label}>
              <span className="sq">{sq}</span> {label}
            </span>
          ))}
        </div>
      </div>

      <div className="foot-main">
        <div className="container-wide">
          <div>
            <div className="brand" style={{ marginBottom: "var(--sp-3)" }}>
              <Emblem size={40} />
              <div>
                <div className="wm">Bharat<span style={{ color: "var(--saffron)" }}>Chain</span></div>
                <div className="motto">सत्यमेव जयते</div>
              </div>
            </div>
            <p style={{ color: "#7e93b4", fontSize: "var(--t-sm)", maxWidth: "32ch" }}>
              {t("foot.tagline")}
            </p>
          </div>
          <div>
            <h4>{t("foot.schemes")}</h4>
            <Link to="/schemes?category=AGRICULTURE">{t("cat.AGRICULTURE")}</Link>
            <Link to="/schemes?category=EDUCATION">{t("cat.EDUCATION")}</Link>
            <Link to="/schemes?category=HOUSING">{t("cat.HOUSING")}</Link>
            <Link to="/schemes?category=HEALTH">{t("cat.HEALTH")}</Link>
            <Link to="/schemes">{t("foot.allSectors")}</Link>
          </div>
          <div>
            <h4>{t("foot.citizens")}</h4>
            <Link to="/signup">{t("foot.applyScheme")}</Link>
            <Link to="/citizen">{t("foot.track")}</Link>
            <Link to="/citizen/wallet">{t("foot.wallet")}</Link>
            <Link to="/about">{t("foot.eligibility")}</Link>
          </div>
          <div>
            <h4>{t("foot.transparency")}</h4>
            <Link to="/ledger">{t("foot.ledger")}</Link>
            <Link to="/ledger">{t("foot.flow")}</Link>
            <Link to="/about">{t("foot.how")}</Link>
            <span className="foot-muted">{t("foot.api")}</span>
          </div>
        </div>
      </div>

      <div className="disclaimer">
        <div className="container-wide">
          <div className="tag">{t("foot.disclaimerTag")}</div>
          <p>{t("foot.disclaimerBody")}</p>
        </div>
      </div>

      <div className="credit">
        <div className="container-wide">
          <span className="nic">NIC</span>
          <p>{t("foot.creditBody", { year: new Date().getFullYear() })}</p>
        </div>
      </div>
    </footer>
  );
}
