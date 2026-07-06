import { FileRedemptionPanel, RedemptionsTable } from "../../components/portalPanels";

export default function AdminRedemptions() {
  return (
    <div className="stack" style={{ gap: "var(--sp-6)" }}>
      <div style={{ maxWidth: 600 }}><FileRedemptionPanel /></div>
      <RedemptionsTable canDecide={false} />
    </div>
  );
}
