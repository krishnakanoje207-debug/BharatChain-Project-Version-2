// ============================================================================
// Lightweight i18n for the public + citizen + vendor surfaces. No runtime deps:
// a context holds the active language, t(key) looks the string up in that
// language's dictionary and falls back to English (then the key itself).
// Admin/RBI operator tools stay English (their keys simply live only in `en`).
// ============================================================================
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { dicts, Dict } from "./translations";

export type LangCode =
  | "en" | "hi" | "bn" | "mr" | "te" | "ta" | "gu"
  | "ur" | "kn" | "or" | "ml" | "pa" | "as" | "mai";

/** The 14 supported languages — English + the major Indian languages. */
export const LANGS: { code: LangCode; label: string; native: string; rtl?: boolean }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "bn", label: "Bengali", native: "বাংলা" },
  { code: "mr", label: "Marathi", native: "मराठी" },
  { code: "te", label: "Telugu", native: "తెలుగు" },
  { code: "ta", label: "Tamil", native: "தமிழ்" },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી" },
  { code: "ur", label: "Urdu", native: "اردو", rtl: true },
  { code: "kn", label: "Kannada", native: "ಕನ್ನಡ" },
  { code: "or", label: "Odia", native: "ଓଡ଼ିଆ" },
  { code: "ml", label: "Malayalam", native: "മലയാളം" },
  { code: "pa", label: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "as", label: "Assamese", native: "অসমীয়া" },
  { code: "mai", label: "Maithili", native: "मैथिली" },
];

const STORAGE_KEY = "bc_lang";

function initialLang(): LangCode {
  if (typeof localStorage === "undefined") return "en";
  const saved = localStorage.getItem(STORAGE_KEY) as LangCode | null;
  return saved && LANGS.some((l) => l.code === saved) ? saved : "en";
}

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

interface I18nCtx { lang: LangCode; setLang: (l: LangCode) => void; t: TFn; dir: "ltr" | "rtl" }
const I18nContext = createContext<I18nCtx | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(initialLang);
  const meta = LANGS.find((l) => l.code === lang) ?? LANGS[0];
  const dir = meta.rtl ? "rtl" : "ltr";

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const en = dicts.en as Dict;
  const t: TFn = (key, vars) => {
    const d = (dicts[lang] ?? en) as Dict;
    return interpolate(d[key] ?? en[key] ?? key, vars);
  };

  return <I18nContext.Provider value={{ lang, setLang: setLangState, t, dir }}>{children}</I18nContext.Provider>;
}

export function useT(): I18nCtx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used within <LangProvider>");
  return ctx;
}

/**
 * Localized summary/ministry for a seed scheme (ids 0–2 have translation keys
 * `scheme.<id>.<field>`). Admin-created schemes have no key, so we fall back to
 * the backend-provided text (t() returns the key verbatim when it is missing).
 */
export function schemeI18n(
  t: TFn,
  schemeId: number | undefined,
  field: "summary" | "ministry",
  fallback?: string,
): string {
  if (schemeId == null) return fallback ?? "";
  const key = `scheme.${schemeId}.${field}`;
  const v = t(key);
  return v === key ? (fallback ?? "") : v;
}
