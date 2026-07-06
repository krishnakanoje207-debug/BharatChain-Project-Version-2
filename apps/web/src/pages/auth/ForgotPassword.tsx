import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../../components/AuthShell";
import { Notice } from "../../components/ui";
import { api, ApiError } from "../../lib/api";
import { useT } from "../../lib/i18n";

export default function ForgotPassword() {
  const nav = useNavigate();
  const { t } = useT();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const requestCode = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const res = await api.forgotPassword(phone.trim());
      setDevCode(res.devCode ?? null);
      if (res.devCode) setCode(res.devCode);
      setStep(2);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("fp.errStart"));
    } finally { setBusy(false); }
  };

  const reset = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await api.resetPassword(phone.trim(), code.trim(), newPassword);
      setStep(3);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("fp.errReset"));
    } finally { setBusy(false); }
  };

  return (
    <AuthShell>
      <div className="head">
        <h2 style={{ fontSize: "var(--t-2xl)" }}>{t("fp.title")}</h2>
        <p style={{ marginTop: 6 }}>
          {step === 1 && t("fp.sub1")}
          {step === 2 && t("fp.sub2", { phone })}
          {step === 3 && t("fp.sub3")}
        </p>
      </div>

      {err && <Notice kind="err">{err}</Notice>}
      {devCode && step === 2 && <Notice kind="ok">{t("fp.demo", { code: devCode })}</Notice>}

      {step === 1 && (
        <form onSubmit={requestCode} className="stack" style={{ marginTop: "var(--sp-4)" }}>
          <div className="form-row">
            <label className="lbl">{t("fp.mobile")}</label>
            <input className="field" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("fp.mobilePh")} inputMode="numeric" required />
          </div>
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? t("fp.sending") : t("fp.send")}</button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={reset} className="stack" style={{ marginTop: "var(--sp-4)" }}>
          <div className="form-row">
            <label className="lbl">{t("fp.code")}</label>
            <input className="field" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("fp.codePh")} inputMode="numeric" maxLength={6} required />
          </div>
          <div className="form-row">
            <label className="lbl">{t("fp.newPw")}</label>
            <input className="field" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t("fp.newPwPh")} autoComplete="new-password" minLength={6} required />
          </div>
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? t("fp.resetting") : t("fp.resetBtn")}</button>
        </form>
      )}

      {step === 3 && (
        <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: "var(--sp-4)" }} onClick={() => nav("/login")}>
          {t("fp.backSignin")}
        </button>
      )}

      <p className="hint center" style={{ marginTop: "var(--sp-5)" }}>
        {t("fp.remembered")} <Link to="/login">{t("fp.signin")}</Link>
      </p>
    </AuthShell>
  );
}
