import { useState } from "react";
import { Link } from "react-router-dom";
import { api, SchemeView, VendorView } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { usePoll } from "../../lib/usePoll";
import { inr, shortAddr } from "../../lib/format";
import { Kpi, Panel, Notice, EmptyState } from "../../components/ui";
import { useT } from "../../lib/i18n";
import { findSelf, serveableSchemes } from "./vendorUtil";

export default function VendorDashboard() {
  const { user } = useAuth();
  const { t } = useT();
  const [vendors, setVendors] = useState<VendorView[]>([]);
  const [schemes, setSchemes] = useState<SchemeView[]>([]);

  usePoll(() => {
    api.vendors().then(setVendors).catch(() => setVendors([]));
    api.allSchemes().then(setSchemes).catch(() => setSchemes([]));
  }, 15000);

  const self = findSelf(user, vendors);
  const serves = serveableSchemes(self?.category, schemes);

  return (
    <div className="stack" style={{ gap: "var(--sp-6)" }}>
      <div>
        <h2 style={{ fontSize: "var(--t-2xl)" }}>{self?.name ?? user?.fullName ?? t("role.VENDOR")}</h2>
        <p style={{ marginTop: 4 }}>{t("vn.dash.sub")}</p>
      </div>

      <div className="kpi-grid">
        <Kpi icon="checkCircle" value={self ? t("vn.dash.approved") : "—"} label={t("vn.dash.registryStatus")} />
        <Kpi icon="store" value={self ? t(`vcat.${self.category}`) : "—"} label={t("vn.dash.category")} />
        <Kpi icon="layers" value={serves.length} label={t("vn.dash.serveable")} />
        <Kpi icon="rupee" value="e₹" label={t("vn.dash.acceptsRupee")} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1.4fr", alignItems: "start" }}>
        <Panel title={t("vn.dash.profile")}>
          {!self ? (
            <Notice kind="warn">{t("vn.dash.notLinked")}</Notice>
          ) : (
            <div className="stack" style={{ gap: "var(--sp-3)" }}>
              <Row k={t("vn.dash.name")} v={self.name} />
              <Row k={t("vn.dash.category")} v={t(`vcat.${self.category}`)} />
              <Row k={t("vn.dash.city")} v={self.city ?? "—"} />
              <Row k={t("vn.dash.onchain")} v={<span className="mono">{shortAddr(self.address)}</span>} />
            </div>
          )}
        </Panel>

        <Panel title={t("vn.dash.canAccept")} sub={t("vn.dash.canAcceptSub")}>
          {serves.length === 0 && <EmptyState icon="layers" title={t("vn.dash.noServeTitle")} note={t("vn.dash.noServeNote")} />}
          <div className="stack" style={{ gap: "var(--sp-3)" }}>
            {serves.map((s) => (
              <div key={s.schemeId} className="row-between" style={{ paddingBottom: "var(--sp-3)", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <b style={{ color: "var(--ink)" }}>{s.name}</b>
                  <div className="caption">{t(`cat.${s.category}`)}</div>
                </div>
                <span className="badge">{inr(Number(s.installmentFormatted))} {t("vn.dash.perInstallment")}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Notice>
        <b>{t("vn.dash.howPaid")}</b> {t("vn.dash.howPaidBody")} <Link to="/vendor/redemptions">{t("vnnav.redemptions")}</Link>.
      </Notice>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="row-between"><span className="caption">{k}</span><b style={{ color: "var(--ink)" }}>{v}</b></div>;
}
