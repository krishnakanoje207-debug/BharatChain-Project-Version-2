import { useState } from "react";
import { api, Notif } from "../../lib/api";
import { usePoll } from "../../lib/usePoll";
import { useT } from "../../lib/i18n";
import { timeAgo } from "../../lib/format";
import { Panel, Loading, EmptyState } from "../../components/ui";
import { Icon } from "../../components/icons";

export default function Notifications() {
  const { t } = useT();
  const [notifs, setNotifs] = useState<Notif[] | null>(null);
  usePoll(() => { api.notifications().then(setNotifs).catch(() => setNotifs([])); });

  const unread = notifs?.filter((n) => !n.read) ?? [];

  const markRead = async (id: string) => {
    await api.markRead(id).catch(() => undefined);
    setNotifs((ns) => ns?.map((n) => (n.id === id ? { ...n, read: true } : n)) ?? null);
  };
  const markAll = async () => {
    await Promise.all(unread.map((n) => api.markRead(n.id).catch(() => undefined)));
    setNotifs((ns) => ns?.map((n) => ({ ...n, read: true })) ?? null);
  };

  return (
    <div className="stack" style={{ gap: "var(--sp-5)" }}>
      <div className="row-between">
        <div>
          <h2 style={{ fontSize: "var(--t-2xl)" }}>{t("cznav.notifications")}</h2>
          <p style={{ marginTop: 4 }}>{t("cz.notif.sub")}</p>
        </div>
        {unread.length > 0 && <button className="btn btn-secondary btn-sm" onClick={markAll}>{t("cz.notif.markAll")}</button>}
      </div>

      {!notifs && <Loading />}
      {notifs?.length === 0 && <EmptyState icon="bell" title={t("cz.notif.noneTitle")} note={t("cz.dash.caughtUp")} />}

      {notifs && notifs.length > 0 && (
        <Panel flush>
          <div>
            {notifs.map((n) => (
              <div key={n.id} className="row" style={{ alignItems: "flex-start", gap: "var(--sp-3)", padding: "var(--sp-4) var(--sp-5)", borderBottom: "1px solid var(--border)", background: n.read ? "transparent" : "var(--surface-2)" }}>
                <span className="emblem" style={{ width: 38, height: 38, background: "var(--info-bg)", color: "var(--info-fg)", flex: "none" }}><Icon.bell size={18} /></span>
                <div style={{ flex: 1 }}>
                  <div className="row-between">
                    <b style={{ color: "var(--ink)" }}>{n.title}</b>
                    <span className="caption">{timeAgo(n.createdAt)}</span>
                  </div>
                  <p style={{ fontSize: "var(--t-sm)", marginTop: 2 }}>{n.body}</p>
                </div>
                {!n.read && <button className="btn btn-ghost btn-sm" onClick={() => markRead(n.id)}>{t("common.markRead")}</button>}
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
