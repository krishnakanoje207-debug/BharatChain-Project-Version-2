import { useState } from "react";
import { api, AdminAppView } from "../../lib/api";
import { usePoll } from "../../lib/usePoll";
import { dateFmt, shortAddr } from "../../lib/format";
import { Kpi, Panel, StatusBadge, Loading, EmptyState } from "../../components/ui";

const FILTERS = ["ALL", "PENDING", "APPROVED", "REJECTED"] as const;
type Filter = (typeof FILTERS)[number];

export default function AdminApplications() {
  const [apps, setApps] = useState<AdminAppView[] | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  usePoll(() => api.allApplications().then(setApps).catch(() => setApps([])));

  const list = apps ?? [];
  const approved = list.filter((a) => a.status === "APPROVED").length;
  const pending = list.filter((a) => a.status === "PENDING").length;
  const rejected = list.filter((a) => a.status === "REJECTED").length;
  const shown = filter === "ALL" ? list : list.filter((a) => a.status === filter);

  return (
    <div className="stack" style={{ gap: "var(--sp-6)" }}>
      <div className="kpi-grid">
        <Kpi icon="file" value={list.length} label="Total applications" />
        <Kpi icon="checkCircle" value={approved} label="Approved & enrolled" />
        <Kpi icon="clock" value={pending} label="Pending" />
        <Kpi icon="alert" value={rejected} label="Rejected" />
      </div>

      {!apps && <Loading />}
      {apps?.length === 0 && <EmptyState icon="file" title="No applications yet" note="Citizen applications across every scheme will appear here." />}

      {apps && apps.length > 0 && (
        <Panel
          title="All applications"
          sub="Every citizen application across all schemes"
          flush
          actions={
            <div className="row" style={{ gap: 6 }}>
              {FILTERS.map((f) => (
                <button key={f} className={`btn btn-sm ${filter === f ? "btn-secondary" : "btn-ghost"}`} onClick={() => setFilter(f)}>
                  {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          }
        >
          <table className="table">
            <thead><tr><th>Applicant</th><th>Scheme</th><th>Status</th><th>Enrolment tx</th><th>Date</th></tr></thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id}>
                  <td><b style={{ color: "var(--ink)" }}>{a.applicant}</b>{a.phone && <div className="caption mono">{a.phone}</div>}</td>
                  <td>{a.schemeName}{a.rejectionReason && <div className="caption" style={{ color: "var(--err-fg)" }}>{a.rejectionReason}</div>}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td className="mono caption">{a.enrollTxHash ? `${shortAddr(a.enrollTxHash)}` : "—"}</td>
                  <td className="caption">{dateFmt(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
