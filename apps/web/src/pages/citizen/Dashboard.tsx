import { useState } from "react";
import { Link } from "react-router-dom";
import { api, AppView, Entitlement, Notif, SchemeView } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";
import { usePoll } from "../../lib/usePoll";
import { inr } from "../../lib/format";
import { Kpi, Panel, StatusBadge, EmptyState, Loading, Notice } from "../../components/ui";
import { Icon } from "../../components/icons";

export default function CitizenDashboard() {
  const { user } = useAuth();
  const { t } = useT();
  const [apps, setApps] = useState<AppView[] | null>(null);
  const [ent, setEnt] = useState<Entitlement[]>([]);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [schemes, setSchemes] = useState<SchemeView[]>([]);

  usePoll(() => {
    api.myApplications().then(setApps).catch(() => setApps([]));
    api.entitlements().then(setEnt).catch(() => setEnt([]));
    api.notifications().then(setNotifs).catch(() => setNotifs([]));
    api.allSchemes().then(setSchemes).catch(() => setSchemes([]));
  });

  const nameOf = (id: number) => schemes.find((s) => s.schemeId === id)?.name ?? `Scheme #${id}`;
  const balance = ent.reduce((s, e) => s + (Number(e.entitlementFormatted) || 0), 0);
  const unread = notifs.filter((n) => !n.read).length;
  const approved = apps?.filter((a) => a.status === "APPROVED").length ?? 0;

  const markRead = async (id: string) => {
    await api.markRead(id).catch(() => undefined);
    setNotifs((ns) => ns.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  return (
    <div className="stack" style={{ gap: "var(--sp-6)" }}>
      <div>
        <h2 style={{ fontSize: "var(--t-2xl)" }}>{t("cz.dash.hello", { name: user?.fullName ?? t("role.CITIZEN") })}</h2>
        <p style={{ marginTop: 4 }}>{t("cz.dash.sub")}</p>
      </div>

      <div className="kpi-grid">
        <Kpi icon="wallet" value={inr(balance)} label={t("cz.dash.balance")} />
        <Kpi icon="checkCircle" value={approved} label={t("cz.dash.enrolled")} />
        <Kpi icon="file" value={apps?.length ?? "—"} label={t("cz.dash.totalApps")} />
        <Kpi icon="bell" value={unread} label={t("cz.dash.unread")} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.5fr 1fr", alignItems: "start" }}>
        <Panel title={t("cz.dash.myApps")} actions={<Link to="/citizen/apply" className="btn btn-accent btn-sm"><Icon.plus size={15} /> {t("common.apply")}</Link>}>
          {!apps && <Loading />}
          {apps?.length === 0 && (
            <EmptyState icon="file" title={t("cz.dash.noAppsTitle")}
              note={t("cz.dash.noAppsNote")}
              action={<Link to="/citizen/apply" className="btn btn-primary">{t("cz.dash.browseApply")}</Link>} />
          )}
          {apps && apps.length > 0 && (
            <div className="stack" style={{ gap: "var(--sp-3)" }}>
              {apps.map((a) => (
                <div key={a.id} className="row-between" style={{ paddingBottom: "var(--sp-3)", borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <b style={{ color: "var(--ink)" }}>{a.schemeName ?? nameOf(a.schemeId)}</b>
                    {a.rejectionReason && <div className="caption" style={{ color: "var(--err-fg)" }}>{a.rejectionReason}</div>}
                    {a.enrollTxHash && <div className="caption mono">tx {a.enrollTxHash.slice(0, 14)}…</div>}
                  </div>
                  <StatusBadge status={a.status} />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <div className="stack" style={{ gap: "var(--sp-6)" }}>
          <Panel title={t("cz.dash.myBalances")} sub={t("cz.dash.perScheme")}>
            {ent.length === 0 && <p className="caption">{t("cz.dash.noBalance")}</p>}
            <div className="stack" style={{ gap: "var(--sp-3)" }}>
              {ent.map((e) => (
                <div key={e.schemeId} className="row-between">
                  <span className="caption">{e.schemeName}</span>
                  <b style={{ color: "var(--navy)" }}>{inr(Number(e.entitlementFormatted))}</b>
                </div>
              ))}
            </div>
            {ent.length > 0 && <Link to="/citizen/wallet" className="btn btn-secondary btn-sm btn-block" style={{ marginTop: "var(--sp-4)" }}>{t("cz.dash.openWallet")}</Link>}
          </Panel>

          <Panel title={t("cznav.notifications")}>
            {notifs.length === 0 && <p className="caption">{t("cz.dash.caughtUp")}</p>}
            <div className="stack" style={{ gap: "var(--sp-3)" }}>
              {notifs.slice(0, 4).map((n) => (
                <div key={n.id} className="row" style={{ alignItems: "flex-start", gap: "var(--sp-3)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, marginTop: 6, flex: "none", background: n.read ? "var(--border-strong)" : "var(--saffron)" }} />
                  <div style={{ flex: 1 }}>
                    <b style={{ color: "var(--ink)", fontSize: "var(--t-sm)" }}>{n.title}</b>
                    <div className="caption">{n.body}</div>
                  </div>
                  {!n.read && <button className="btn btn-ghost btn-sm" onClick={() => markRead(n.id)}>{t("common.read")}</button>}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <Notice>{t("cz.dash.tip")}</Notice>
    </div>
  );
}
