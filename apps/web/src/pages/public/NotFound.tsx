import { Link } from "react-router-dom";
import { EmptyState } from "../../components/ui";
import { useT } from "../../lib/i18n";

export default function NotFound() {
  const { t } = useT();
  return (
    <section className="section">
      <div className="container">
        <EmptyState
          icon="search"
          title={t("nf.title")}
          note={t("nf.note")}
          action={<Link to="/" className="btn btn-primary">{t("nf.back")}</Link>}
        />
      </div>
    </section>
  );
}
