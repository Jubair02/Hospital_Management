import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getToken, setToken, clearToken, TOKEN_KEY } from '../services/api';
import { loginRequest, getMeRequest, logoutRequest } from '../services/authService';
import useIdleTimeout from '../hooks/useIdleTimeout';
import {
  clearActivity,
  clearLogoutReason,
  isIdleExpired,
  markActivity,
  setLogoutReason,
  type LogoutReason,
} from '../utils/session';
import type { Role, User } from '../types';

export interface AuthContextValue {
  user: User | null;
  role: Role | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // True only while restoring the session on first load — route guards
  // wait for this before deciding to redirect.
  const [loading, setLoading] = useState(true);

  /**
   * Drops every trace of the session on this client. `reason` is set only when
   * the session ended by itself, so the login page can say why.
   */
  const endSession = useCallback((reason?: LogoutReason) => {
    // Best-effort server call; the client is the source of truth for JWTs.
    //
    // The token is handed over explicitly rather than left to the request
    // interceptor: that runs a microtask later, by which point the two lines
    // below have already cleared it, and the sign-out went out unauthenticated
    // — so the audit trail recorded logins with no matching logouts. Storage
    // is still cleared in this tick, so a hung request cannot leave a live
    // token behind.
    logoutRequest(getToken()).catch(() => {});
    clearToken();
    clearActivity();

    if (reason) setLogoutReason(reason);
    setUser(null);
  }, []);

  const logout = useCallback(() => {
    endSession();
  }, [endSession]);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }

    // Refreshing the page must not launder an abandoned session. The token can
    // still be cryptographically valid here — it is the idle deadline, not the
    // token, that has passed — so this is checked before `/auth/me` is asked.
    if (isIdleExpired()) {
      clearToken();
      clearActivity();
      setLogoutReason('inactivity');
      setLoading(false);
      return;
    }

    let cancelled = false;

    getMeRequest()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        // Token invalid or account deactivated — start signed out.
        clearToken();
        clearActivity();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    const { token, user: loggedInUser } = await loginRequest(email, password);
    setToken(token);
    markActivity();
    clearLogoutReason();
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const handleIdle = useCallback(() => {
    endSession('inactivity');
  }, [endSession]);

  useIdleTimeout({ enabled: Boolean(user), onIdle: handleIdle });

  // Signing out in one tab has to sign out the rest. Without this, a second
  // tab keeps rendering patient data against a token that no longer exists,
  // until something happens to make it call the API.
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key === TOKEN_KEY && event.newValue === null) {
        setUser(null);
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role: user?.role ?? null,
      isAuthenticated: Boolean(user),
      loading,
      login,
      logout,
    }),
    [user, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
