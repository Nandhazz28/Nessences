import { createContext, useContext, useEffect, useState } from 'react';
import { contentApi } from '../services/engage.js';

const EMPTY = { storeName: 'Nessence', supportEmail: null, supportPhone: null, social: {} };
const Ctx = createContext({ settings: EMPTY, loaded: false });
export const useSettings = () => useContext(Ctx);

// Public store settings, fetched once. Optional: if the request fails the site simply shows no social links / contact details.
export function SettingsProvider({ children }) {
  const [state, setState] = useState({ settings: EMPTY, loaded: false });
  useEffect(() => {
    const ctrl = new AbortController();
    contentApi.settings(ctrl.signal).then((s) => setState({ settings: { ...EMPTY, ...s, social: s.social ?? {} }, loaded: true }), (e) => e.name !== 'AbortError' && setState({ settings: EMPTY, loaded: true }));
    return () => ctrl.abort();
  }, []);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}
