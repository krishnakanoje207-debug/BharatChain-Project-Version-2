import { useState } from "react";
import { api, AdminVendorAppView } from "../../lib/api";
import { usePoll } from "../../lib/usePoll";
import { VendorsTable } from "../../components/portalPanels";
import { Panel, Notice, StatusBadge, Loading, EmptyState } from "../../components/ui";
import { VENDOR_CATEGORY_LABELS, dateFmt } from "../../lib/format";

const FILTERS = ["PENDING", "ALL", "APPROVED", "REJECTED"] as const;
type Filter = (typeof FILTERS)[number];

/** Admin review of self-registered vendor onboarding requests. */
function VendorApplicationsPanel() {
  const [apps, setApps] = useState<AdminVendorAppView[] | null>(null);
  const [filter, setFilter] = useState<Filter>("PENDING");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = () => api.vendorApplications().then(setApps).catch(() => setApps([]));
  usePoll(reload, 15000);

  const list = apps ?? [];
  const shown = filter === "ALL" ? list : list.filter((a) => a.status === filter);
  const pendingCount = list.filter((a) => a.status === "PENDING").length;

  const approve = async (a: AdminVendorAppView) => {
    setBusy(a.id); setMsg(null); setErr(null);
    try {
      const r = await api.approveVendorApplication(a.id);
      setMsg(`Approved ${a.businessName} — registered on-chain and enrolled into ${r.schemesEnrolled} scheme(s).`);
      reload();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  };

  const reject = async (a: AdminVendorAppView) => {
    const reason = window.prompt(`Reject "${a.businessName}"? You can add a reason (optional):`, "");
    if (reason === null) return; // cancelled
    setBusy(a.id); setMsg(null); setErr(null);
    try {
      await api.rejectVendorApplication(a.id, reason.trim() || undefined);
      setMsg(`Rejected ${a.businessName}.`);
      reload();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  };

  if (!apps) return <Loading />;

  return (
    <div className="stack" style={{ gap: "var(--sp-4)" }}>
      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="err">{err}</Notice>}

      {apps.length === 0 ? (
        <EmptyState icon="store" title="No vendor applications" note="Self-registered vendors awaiting onboarding will appear here for review." />
      ) : (
        <Panel
          title="Vendor applications"
          sub={pendingCount > 0 ? `${pendingCount} awaiting review` : "All applications reviewed"}
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
            <thead><tr><th>Business</th><th>Applicant</th><th>Category</th><th>Status</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id}>
                  <td>
                    <b style={{ color: "var(--ink)" }}>{a.businessName}</b>
                    <div className="caption mono">{a.businessId}{a.city ? ` · ${a.city}` : ""}</div>
                  </td>
                  <td>{a.applicant}{a.phone && <div className="caption mono">{a.phone}</div>}</td>
                  <td><span className="badge">{VENDOR_CATEGORY_LABELS[a.category] ?? a.category}</span></td>
                  <td>
                    <StatusBadge status={a.status} />
                    {a.status === "REJECTED" && a.rejectionReason && (
                      <div className="caption" style={{ color: "var(--err-fg)" }}>{a.rejectionReason}</div>
                    )}
                  </td>
                  <td className="caption">{dateFmt(a.createdAt)}</td>
                  <td>
                    {a.status === "PENDING" ? (
                      <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn btn-primary btn-sm" disabled={busy === a.id} onClick={() => approve(a)}>
                          {busy === a.id ? "Approving…" : "Approve"}
                        </button>
                        <button className="btn btn-ghost btn-sm" disabled={busy === a.id} onClick={() => reject(a)}>
                          Reject
                        </button>
                      </div>
                    ) : <span className="caption">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}

export default function AdminVendors() {
  return (
    <div className="stack" style={{ gap: "var(--sp-6)" }}>
      <VendorApplicationsPanel />
      <VendorsTable canEnroll={true} />
    </div>
  );
}
