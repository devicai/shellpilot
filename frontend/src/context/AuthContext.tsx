import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getToken, setToken } from '../api/client';
import { authApi } from '../api/endpoints/auth';
import { publicConfigApi, type PublicConfig } from '../api/endpoints/publicConfig';
import type { AuthenticatedUser } from '../types/api';

interface AuthContextValue {
  user: AuthenticatedUser | null;
  loading: boolean;
  /** Bootstrap config read once at startup; null until loaded (treat as local-only). */
  publicConfig: PublicConfig | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [publicConfig, setPublicConfig] = useState<PublicConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    const token = getToken();

    // Public config is unauthenticated and drives the login UI; fetch it alongside
    // the session check so both are settled before we drop the loading state.
    const cfgP = publicConfigApi
      .get()
      .then((cfg) => {
        if (!cancelled) setPublicConfig(cfg);
      })
      .catch(() => {
        /* fall back to local-only UI */
      });

    const meP = token
      ? authApi
          .me()
          .then((u) => {
            if (!cancelled) setUser(u);
          })
          .catch(() => setToken(null))
      : Promise.resolve();

    Promise.allSettled([cfgP, meP]).then(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    setToken(res.accessToken);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    }
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, publicConfig, login, logout }),
    [user, loading, publicConfig, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
