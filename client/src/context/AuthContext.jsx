import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { authApi } from "../services/auth.js";
import { onSessionExpired } from "../services/http.js";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const revalidate = useCallback(async () => {
    try {
      const u = await authApi.me();
      if (alive.current) {
        setUser(u);
        setAuthError(null);
      }
      return u;
    } catch (e) {
      if (!alive.current) return null;
      if (e.isAuth) {
        setUser(null);
        setAuthError(null);
      } else setAuthError(e);
      return null;
    } finally {
      if (alive.current) setReady(true);
    }
  }, []);

  useEffect(() => {
    revalidate();
  }, [revalidate]);
  useEffect(
    () =>
      onSessionExpired(() => {
        setUser(null);
        setAuthError(null);
      }),
    [],
  );
  useEffect(() => {
    if (!authError) return undefined;
    const again = () => {
      if (document.visibilityState !== "hidden") revalidate();
    };
    window.addEventListener("online", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.removeEventListener("online", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, [authError, revalidate]);

  const login = useCallback(async (creds) => {
    const u = await authApi.login(creds);
    setUser(u);
    setAuthError(null);
    return u;
  }, []);
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (e) {
      if (e.isTransient) throw e;
    }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, authError, revalidate, login, logout, setUser }),
    [user, ready, authError, revalidate, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
