import { FormEvent, Fragment, ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Icon } from "./icons";
import { useT } from "../lib/i18n";

interface Msg { who: "me" | "bot"; text: string }

/**
 * Render the assistant's lightweight markdown: [label](target) links (internal
 * paths become SPA links) and **bold**. Everything else stays plain text.
 */
function renderAnswer(text: string): ReactNode {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const [, label, target] = link;
      return target.startsWith("/")
        ? <Link key={i} to={target}>{label}</Link>
        : <a key={i} href={target} target="_blank" rel="noreferrer">{label}</a>;
    }
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    if (bold) return <strong key={i}>{bold[1]}</strong>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/**
 * Floating AI assistant (FAB + chat panel). Two modes:
 *  - signed-in CITIZEN → personal chat grounded in their own data (/assistant/chat);
 *  - everyone else (incl. anonymous visitors) → public info desk (/assistant/public/chat).
 */
export default function Assistant() {
  const { t, lang } = useT();
  const { user } = useAuth();
  const personal = user?.role === "CITIZEN";

  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>(() => [{ who: "bot", text: t("ai.greeting") }]);
  const [sugs, setSugs] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Starter prompts depend on the mode; refetch when it changes (e.g. login/logout).
  useEffect(() => { setSugs([]); }, [personal]);
  useEffect(() => {
    if (open && sugs.length === 0) {
      const load = personal ? api.assistantSuggestions() : api.assistantPublicSuggestions();
      load.then((r) => setSugs(r.suggestions ?? [])).catch(() => undefined);
    }
  }, [open, sugs.length, personal]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  const ask = async (text: string) => {
    if (!text.trim() || busy) return;
    setInput("");
    setMsgs((m) => [...m, { who: "me", text }]);
    setBusy(true);
    try {
      const r = personal ? await api.assistantChat(text, lang) : await api.assistantPublicChat(text, lang);
      setMsgs((m) => [...m, { who: "bot", text: r.answer }]);
    } catch {
      setMsgs((m) => [...m, { who: "bot", text: t("ai.error") }]);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => { e.preventDefault(); ask(input); };

  return (
    <>
      {open && (
        <div className="ai-panel" role="dialog" aria-label={t("ai.title")}>
          <div className="ai-head">
            <div className="who">
              <span className="orb"><Icon.sparkle size={18} /></span>
              <div>
                <div className="t">{t("ai.title")}</div>
                <div className="s">{t("ai.subtitle")}</div>
              </div>
            </div>
            <button className="ai-close" onClick={() => setOpen(false)} aria-label={t("ai.close")}>×</button>
          </div>

          <div className="ai-body" ref={bodyRef}>
            {msgs.map((m, i) => (
              <div key={i} className={`msg ${m.who}`}>{m.who === "bot" ? renderAnswer(m.text) : m.text}</div>
            ))}
            {busy && <div className="msg bot typing">{t("ai.typing")}</div>}
          </div>

          {sugs.length > 0 && (
            <div className="ai-sugs">
              {sugs.slice(0, 4).map((s) => <button key={s} onClick={() => ask(s)}>{s}</button>)}
            </div>
          )}

          <form className="ai-input" onSubmit={submit}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t("ai.inputPh")} aria-label={t("ai.send")} />
            <button type="submit" aria-label={t("ai.send")}><Icon.send size={18} /></button>
          </form>
        </div>
      )}

      <button className="ai-fab" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="orb"><Icon.sparkle size={18} /></span>
        <span className="txt">{t("ai.fab")}</span>
        {!open && <span className="pulse" />}
      </button>
    </>
  );
}
