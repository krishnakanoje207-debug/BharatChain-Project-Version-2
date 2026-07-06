import { useState } from "react";
import { Link } from "react-router-dom";
import { api, PaymentView, SchemeView } from "../../lib/api";
import { usePoll } from "../../lib/usePoll";
import { useT } from "../../lib/i18n";
import { inr, shortAddr } from "../../lib/format";
import { Panel, StatusBadge, Loading, EmptyState } from "../../components/ui";
import { Icon } from "../../components/icons";

export default function History() {
  const { t } = useT();
  const [pays, setPays] = useState<PaymentView[] | null>(null);
  const [schemes, setSchemes] = useState<SchemeView[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  usePoll(() => {
    api.myPayments().then(setPays).catch(() => setPays([]));
    api.allSchemes().then(setSchemes).catch(() => setSchemes([]));
  });

  const nameOf = (id: number) => schemes.find((s) => s.schemeId === id)?.name ?? `Scheme #${id}`;

  const confirm = async (id: string) => {
    setBusyId(id);
    try { await api.confirmDelivery(id); api.myPayments().then(setPays).catch(() => undefined); }
    finally { setBusyId(null); }
  };

  return (
    <div className="stack" style={{ gap: "var(--sp-5)" }}>
      <div>
        <h2 style={{ fontSize: "var(--t-2xl)" }}>{t("cz.hist.title")}</h2>
        <p style={{ marginTop: 4 }}>{t("cz.hist.sub")}</p>
      </div>

      {!pays && <Loading />}
      {pays?.length === 0 && (
        <EmptyState icon="clock" title={t("cz.hist.noTitle")}
          note={t("cz.hist.noNote")}
          action={<Link to="/citizen/wallet" className="btn btn-primary">{t("cz.hist.goWallet")}</Link>} />
      )}

      {pays && pays.length > 0 && (
        <Panel flush>
          <table className="table">
            <thead>
              <tr><th>{t("col.vendor")}</th><th>{t("col.scheme")}</th><th>{t("col.amount")}</th><th>{t("col.status")}</th><th>{t("col.date")}</th><th></th></tr>
            </thead>
            <tbody>
              {pays.map((p) => (
                <tr key={p.id}>
                  <td><b style={{ color: "var(--ink)" }}>{p.vendorName ?? <span className="mono">{shortAddr(p.vendorAddress)}</span>}</b></td>
                  <td>{nameOf(p.schemeId)}</td>
                  <td><b style={{ color: "var(--navy)" }}>{inr(Number(p.amountFormatted))}</b></td>
                  <td><StatusBadge status={p.status} /></td>
                  <td className="caption">{new Date(p.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                  <td>
                    {p.status === "PAID" && (
                      <button className="btn btn-secondary btn-sm" disabled={busyId === p.id} onClick={() => confirm(p.id)}>
                        {busyId === p.id ? "…" : <><Icon.check size={14} /> {t("cz.hist.confirmDelivery")}</>}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      <p className="hint">{t("cz.hist.footHint")}</p>
    </div>
  );
}
