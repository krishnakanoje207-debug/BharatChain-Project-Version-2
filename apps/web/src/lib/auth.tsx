import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { api, tokens, PublicUser, Tokens, Role } from "./api";

interface AuthState {
  user: PublicUser | null;
  loading: boolean;
  /** Establish a session from a login/verify response (sets tokens + user). */
  setSession: (t: Tokens, user: PublicUser) => void;
  login: (phone: string, password: string) => Promise<PublicUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState>(null as unknown as AuthState);
export const useAuth = () => useContext(Ctx);

/** Default landing route for a given role (where login/signup should send a user). */
export function homeForRole(role: Role | string | undefined): string {
  switch (role) {
    case "ADMIN": return "/admin";
    case "RBI_ADMIN": return "/rbi";
    case "VENDOR": return "/vendor";
    default: return "/citizen";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tokens.access) { setUser(null); return; }
    try { setUser(await api.me()); }
    catch { tokens.clear(); setUser(null); }
  }, []);

  // Restore the session on first load.
  useEffect(() => {
    if (!tokens.access) { setLoading(false); return; }
    api.me().then(setUser).catch(() => tokens.clear()).finally(() => setLoading(false));
  }, []);

  // Heartbeat keeps the server session alive (and detects forced logout).
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      api.heartbeat().catch(() => { tokens.clear(); setUser(null); });
    }, 30_000);
    return () => clearInterval(id);
  }, [user]);

  const setSession: AuthState["setSession"] = (t, u) => { tokens.set(t); setUser(u); };

  const login: AuthState["login"] = async (phone, password) => {
    const res = await api.login(phone, password);
    setSession(res.tokens, res.user);
    return res.user;
  };

  const logout: AuthState["logout"] = async () => {
    await api.logout();
    tokens.clear();
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, loading, setSession, login, logout, refresh }}>
      {children}
    </Ctx.Provider>
  );
}
