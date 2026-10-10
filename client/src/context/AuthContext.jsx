import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../services/auth.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    authApi.me().then(setUser).catch(() => setUser(null)).finally(() => setReady(true));
  }, []);

  const login = useCallback(async (creds) => { const u = await authApi.login(creds); setUser(u); return u; }, []);
  const logout = useCallback(async () => { try { await authApi.logout(); } finally { setUser(null); } }, []);
  const value = useMemo(() => ({ user, ready, login, logout, setUser }), [user, ready, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
