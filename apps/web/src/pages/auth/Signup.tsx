import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../../components/AuthShell";
import { Notice } from "../../components/ui";
import { useAuth, homeForRole } from "../../lib/auth";
import { useT } from "../../lib/i18n";
import { api, ApiError, Role } from "../../lib/api";

export default function Signup() {
  const { setSession } = useAuth();
  const { t } = useT();
  const nav = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [role, setRole] = useState<"CITIZEN" | "VENDOR">("CITIZEN");
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", password: "" });
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const register = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const res = await api.signup({
        phone: form.phone.trim(), password: form.password, role,
        fullName: form.fullName.trim() || undefined, email: form.email.trim() || undefined,
      });
      setDevCode(res.devCode ?? null);
      if (res.devCode) setCode(res.devCode);
      setStep(2);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not create your account. Please try again.");
    } finally { setBusy(false); }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const res = await api.verifyOtp(form.phone.trim(), code.trim());
      setSession(res.tokens, res.user);
      nav(homeForRole(res.user.role as Role), { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "That code didn't verify. Please try again.");
    } finally { setBusy(false); }
  };

  return (
    <AuthShell>
      <div className="head">
        <h2 style={{ fontSize: "var(--t-2xl)" }}>{step === 1 ? t("auth.signup.title") : t("auth.verifyTitle")}</h2>
        <p style={{ marginTop: 6 }}>
          {step === 1 ? t("auth.signup.sub") : `${t("auth.verifyCode")} — ${form.phone}`}
        </p>
      </div>

      {step === 1 && (
        <div className="tabs">
          <Link to="/login">{t("acct.signin")}</Link>
          <Link to="/signup" className="active">{t("acct.register")}</Link>
        </div>
      )}

      {err && <Notice kind="err">{err}</Notice>}
      {devCode && step === 2 && <Notice kind="ok">Demo — {devCode}</Notice>}

      {step === 1 ? (
        <form onSubmit={register} className="stack" style={{ marginTop: "var(--sp-4)" }}>
          <div className="form-row">
            <label className="lbl">{t("auth.roleLabel")}</label>
            <div className="row" style={{ gap: "var(--sp-2)" }}>
              <button type="button" className={`btn btn-sm ${role === "CITIZEN" ? "btn-primary" : "btn-secondary"}`} style={{ flex: 1 }} onClick={() => setRole("CITIZEN")}>{t("role.CITIZEN")}</button>
              <button type="button" className={`btn btn-sm ${role === "VENDOR" ? "btn-primary" : "btn-secondary"}`} style={{ flex: 1 }} onClick={() => setRole("VENDOR")}>{t("role.VENDOR")}</button>
            </div>
            {role === "VENDOR" && <div className="hint" style={{ marginTop: 6 }}>{t("auth.vendorHint")}</div>}
          </div>
          <div className="form-row">
            <label className="lbl">{t("auth.fullName")}</label>
            <input className="field" value={form.fullName} onChange={set("fullName")} placeholder={t("auth.fullNamePh")} autoComplete="name" required />
          </div>
          <div className="form-row">
            <label className="lbl">{t("auth.phone")}</label>
            <input className="field" value={form.phone} onChange={set("phone")} placeholder={t("auth.phonePh")} inputMode="numeric" autoComplete="tel" required />
          </div>
          <div className="form-row">
            <label className="lbl">{t("auth.email")} <span className="caption">{t("auth.optional")}</span></label>
            <input className="field" type="email" value={form.email} onChange={set("email")} placeholder="you@example.com" autoComplete="email" />
          </div>
          <div className="form-row">
            <label className="lbl">{t("auth.password")}</label>
            <input className="field" type="password" value={form.password} onChange={set("password")} placeholder={t("auth.createPw")} autoComplete="new-password" required minLength={6} />
          </div>
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? t("auth.creating") : t("auth.createBtn")}</button>
        </form>
      ) : (
        <form onSubmit={verify} className="stack" style={{ marginTop: "var(--sp-4)" }}>
          <div className="form-row">
            <label className="lbl">{t("auth.verifyCode")}</label>
            <input className="field" value={code} onChange={(e) => setCode(e.target.value)} placeholder="••••••"
              inputMode="numeric" maxLength={6} style={{ letterSpacing: "0.4em", fontWeight: 700, textAlign: "center", fontSize: "var(--t-lg)" }} required />
          </div>
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? t("auth.signingIn") : t("auth.verifyBtn")}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setStep(1); setErr(null); }}>←</button>
        </form>
      )}

      <p className="hint center" style={{ marginTop: "var(--sp-5)" }}>
        {t("auth.haveAccount")} <Link to="/login">{t("acct.signin")} →</Link>
      </p>
    </AuthShell>
  );
}
