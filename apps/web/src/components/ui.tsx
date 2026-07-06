import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, IconName } from "./icons";
import { SchemeView } from "../lib/api";
import { fromWei, inrCompact, statusBadge, titleCase } from "../lib/format";
import { useT, schemeI18n } from "../lib/i18n";

export function Spinner({ size = 20 }: { size?: number }) {
  const { t } = useT();
  return <span className="spinner" style={{ width: size, height: size }} role="status" aria-label={t("common.loading")} />;
}

export function Loading({ label }: { label?: string }) {
  const { t } = useT();
  return <div className="loading-row"><Spinner /> {label ?? t("common.loading")}</div>;
}

export function EmptyState({ icon = "file", title, note, action }: { icon?: IconName; title: string; note?: string; action?: ReactNode }) {
  const I = Icon[icon];
  return (
    <div className="empty">
      <I size={40} className="ic" />
      <h3 style={{ color: "var(--ink-2)", fontWeight: 600 }}>{title}</h3>
      {note && <p style={{ marginTop: 6, maxWidth: "44ch", marginInline: "auto" }}>{note}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

export function Badge({ variant, children }: { variant?: string; children: ReactNode }) {
  return <span className={`badge ${variant ?? ""}`}>{children}</span>;
}

/** Status pill that picks its colour from the domain status string. */
export function StatusBadge({ status }: { status?: string }) {
  return <span className={`badge ${statusBadge(status)}`}><span className="dot" />{titleCase(status)}</span>;
}

export function Notice({ kind = "", children }: { kind?: "" | "err" | "ok" | "warn"; children: ReactNode }) {
  return <div className={`notice ${kind}`}>{children}</div>;
}

export function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="head-c">
      <h2>{title}</h2>
      <div className="uline" />
      {sub && <p>{sub}</p>}
    </div>
  );
}

const CATEGORY_ICON: Record<string, IconName> = {
  AGRICULTURE: "leaf", EDUCATION: "book", HOUSING: "home",
  HEALTH: "heart", EMPLOYMENT: "briefcase", SOCIAL_WELFARE: "shield",
};

/** A scheme browse card linking to the scheme detail / apply flow. */
export function SchemeCard({ scheme }: { scheme: SchemeView }) {
  const { t } = useT();
  const disbursed = fromWei(scheme.disbursed);
  const I = Icon[CATEGORY_ICON[scheme.category] ?? "grid"];
  return (
    <Link to={`/schemes/${scheme.schemeId}`} className="card card-hover scheme-card">
      <div className="top">
        <span className="ic"><I size={22} /></span>
        <span className={`badge ${scheme.active ? "badge-ok" : ""}`}>
          {scheme.active && <span className="dot" />}{scheme.active ? t("status.active") : t("status.closed")}
        </span>
      </div>
      <h3>{scheme.name}</h3>
      <div className="min">{schemeI18n(t, scheme.schemeId, "ministry", scheme.ministry) || t(`cat.${scheme.category}`)}</div>
      <p>{schemeI18n(t, scheme.schemeId, "summary", scheme.description) || t("card.defaultDesc")}</p>
      <div className="meta">
        <div>
          <div className="v">{scheme.installmentFormatted || "—"}</div>
          <div className="k">{t("card.perInstallment")}</div>
        </div>
        <div>
          <div className="v">{inrCompact(disbursed)}</div>
          <div className="k">{t("card.disbursed")}</div>
        </div>
      </div>
      <div className="foot">
        <span className="btn btn-primary btn-sm" style={{ flex: 1 }}>{t("card.checkEligibility")}</span>
      </div>
    </Link>
  );
}

/** Compact KPI tile for portal dashboards. */
export function Kpi({ icon, value, label, delta }: { icon: IconName; value: ReactNode; label: string; delta?: { dir: "up" | "down"; text: string } }) {
  const I = Icon[icon];
  return (
    <div className="kpi">
      <span className="ic"><I size={22} /></span>
      <div className="v">{value}</div>
      <div className="k">{label}</div>
      {delta && <div className={`delta ${delta.dir}`}>{delta.dir === "up" ? "▲" : "▼"} {delta.text}</div>}
    </div>
  );
}

export function Panel({ title, sub, actions, children, flush }: { title?: string; sub?: string; actions?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <div className="panel">
      {(title || actions) && (
        <div className="panel-head">
          <div>
            {title && <h3>{title}</h3>}
            {sub && <div className="sub">{sub}</div>}
          </div>
          {actions}
        </div>
      )}
      <div className={flush ? "panel-table" : "panel-body"}>{children}</div>
    </div>
  );
}
