import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Masthead from "./Masthead";
import Footer from "./Footer";
import Assistant from "./Assistant";
import { Icon } from "./icons";
import { useT } from "../lib/i18n";

export default function PublicLayout() {
  const { t } = useT();
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <a className="skip-link" href="#main">{t("layout.skip")}</a>
      <Masthead />
      <main id="main"><Outlet /></main>
      <Footer />
      {showTop && (
        <button className="totop" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label={t("layout.toTop")}>
          <Icon.chevronLeft size={20} style={{ transform: "rotate(90deg)" }} />
        </button>
      )}
      {/* Public info desk for visitors; personal mode for signed-in citizens. */}
      <Assistant />
    </>
  );
}
