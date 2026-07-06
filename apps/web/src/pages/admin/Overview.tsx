import { useState } from "react";
import { Link } from "react-router-dom";
import { api, AnomalyView, RedemptionView, RoundView, SchemeView } from "../../lib/api";
import { usePoll } from "../../lib/usePoll";
import { fromWei, inrCompact, shortAddr } from "../../lib/format";
import { Kpi, Panel, StatusBadge, Loading, Notice } from "../../components/ui";
import { Icon, IconName } from "../../components/icons";

const ACTIONS: { to: string; label: string; icon: IconName }[] = [
  { to: "/admin/disbursement", label: "Run disbursement", icon: "send" },
  { to: "/admin/redemptions", label: "File redemption", icon: "refresh" },
  { to: "/admin/vendors", label: "Manage vendors", icon: "store" },
  { to: "/admin/anomalies", label: "Review anomalies", icon: "alert" },
];

export default function AdminOverview() {
  const [schemes, setSchemes] = useState<SchemeView[] | null>(null);
  const [rounds, setRounds] = useState<RoundView[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyView[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionView[]>([]);

  usePoll(() => {
    api.allSchemes().then(setSchemes).catch(() => setSchemes([]));
    api.rounds().then(setRounds).catch(() => setRounds([]));
    api.anomalies().then(setAnomalies).catch(() => setAnomalies([]));
    api.redemptions().then(setRedemptions).catch(() => setRedemptions([]));
  });

  if (!schemes) return <Loading />;
  const disbursed = schemes.reduce((s, x) => s + fromWei(x.disbursed), 0);
  const openAnoms = anomalies.filter((a) => a.status === "OPEN");
  const pendRedemptions = redemptions.filter((r) => r.status === "PENDING").length;
  const schemeName = (id: number) => schemes.find((s) => s.schemeId === id)?.name ?? `Scheme #${id}`;

  return (
    <div className="stack" style={{ gap: "var(--sp-6)" }}>
      <div className="kpi-grid">
        <Kpi icon="layers" value={schemes.filter((s) => s.active).length} label="Active schemes" />
        <Kpi icon="rupee" value={inrCompact(disbursed)} label="Disbursed (e₹)" />
        <Kpi icon="refresh" value={pendRedemptions} label="Pending redemptions" />
        <Kpi icon="alert" value={openAnoms.length} label="Open anomalies" />
      </div>

      <Panel title="Quick actions">
        <div className="grid cols-4">
          {ACTIONS.map((a) => {
            const I = Icon[a.icon];
            return (
              <Link key={a.to} to={a.to} className="card card-hover" style={{ textAlign: "center" }}>
                <span className="emblem" style={{ width: 44, height: 44, margin: "0 auto var(--sp-2)", background: "var(--surface-2)", color: "var(--navy)" }}><I size={22} /></span>
                <b style={{ color: "var(--ink)", fontSize: "var(--t-sm)" }}>{a.label}</b>
              </Link>
            );
          })}
        </div>
      </Panel>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", alignItems: "start" }}>
        <Panel title="Recent disbursement rounds" actions={<Link to="/admin/disbursement" className="btn btn-ghost btn-sm">All →</Link>}>
          {rounds.length === 0 && <p className="caption">No rounds yet.</p>}
          <div className="stack" style={{ gap: "var(--sp-3)" }}>
            {rounds.slice(0, 5).map((r) => (
              <div key={r.id} className="row-between" style={{ paddingBottom: "var(--sp-3)", borderBottom: "1px solid var(--border)" }}>
                <div><b style={{ color: "var(--ink)" }}>{schemeName(r.schemeId)}</b><div className="caption">Installment #{r.installmentNo} · {r.claimedCount}/{r.beneficiaryCount} credited</div></div>
                <b style={{ color: "var(--navy)" }}>{inrCompact(fromWei(r.allocated))}</b>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Open anomalies" actions={<Link to="/admin/anomalies" className="btn btn-ghost btn-sm">All →</Link>}>
          {openAnoms.length === 0 && <Notice kind="ok">No open anomalies.</Notice>}
          <div className="stack" style={{ gap: "var(--sp-3)" }}>
            {openAnoms.slice(0, 5).map((a) => (
              <div key={a.id} className="row" style={{ alignItems: "flex-start", gap: "var(--sp-3)" }}>
                <span className="emblem" style={{ width: 34, height: 34, background: "var(--warn-bg)", color: "var(--warn-fg)", flex: "none" }}><Icon.alert size={16} /></span>
                <div style={{ flex: 1 }}>
                  <div className="row-between"><b style={{ color: "var(--ink)", fontSize: "var(--t-sm)" }}>{a.type.replace(/_/g, " ")}</b><StatusBadge status={a.severity} /></div>
                  <div className="caption">{a.message} · <span className="mono">{shortAddr(a.subjectId)}</span></div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
