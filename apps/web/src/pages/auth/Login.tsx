import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthShell from "../../components/AuthShell";
import { Notice } from "../../components/ui";
import { useAuth, homeForRole } from "../../lib/auth";
import { useT } from "../../lib/i18n";
import { ApiError } from "../../lib/api";

export default function Login() {
  const { login } = useAuth();
  const { t } = useT();
  const nav = useNavigate();
  const loc = useLocation();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const user = await login(phone.trim(), password);
      const from = (loc.state as { from?: string } | null)?.from;
      nav(from && from !== "/login" ? from : homeForRole(user.role), { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <div className="head">
        <h2 style={{ fontSize: "var(--t-2xl)" }}>{t("auth.login.title")}</h2>
        <p style={{ marginTop: 6 }}>{t("auth.login.sub")}</p>
      </div>
      <div className="tabs">
        <Link to="/login" className="active">{t("acct.signin")}</Link>
        <Link to="/signup">{t("acct.register")}</Link>
      </div>

      {err && <Notice kind="err">{err}</Notice>}

      <form onSubmit={submit} className="stack" style={{ marginTop: "var(--sp-4)" }}>
        <div className="form-row">
          <label className="lbl" htmlFor="phone">{t("auth.phone")}</label>
          <input id="phone" className="field" value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder={t("auth.phonePh")} inputMode="numeric" autoComplete="username" required />
        </div>
        <div className="form-row">
          <div className="row-between">
            <label className="lbl" htmlFor="password">{t("auth.password")}</label>
            <Link to="/forgot-password" style={{ fontSize: "var(--t-sm)" }}>{t("auth.forgot")}</Link>
          </div>
          <input id="password" type="password" className="field" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.passwordPh")} autoComplete="current-password" required />
        </div>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? t("auth.signingIn") : t("auth.login.title")}
        </button>
      </form>

      <p className="hint center" style={{ marginTop: "var(--sp-5)" }}>
        {t("auth.newHere")} <Link to="/signup">{t("auth.createAccount")}</Link>
      </p>
    </AuthShell>
  );
}
