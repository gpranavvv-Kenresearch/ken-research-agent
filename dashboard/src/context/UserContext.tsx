'use client';
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { getUser, type UserConfig } from '@/lib/userConfig';

interface UserCtx {
  user: UserConfig | null;
  setUser: (u: UserConfig | null) => void;
  clearUser: () => void;
}

const Ctx = createContext<UserCtx>({ user: null, setUser: () => {}, clearUser: () => {} });

// Only the user's ID is persisted, never the full config object — that object
// (tab names, colors, spreadsheetId) can change in future deploys, and a cached
// stale copy would silently keep serving old data forever (e.g. a spreadsheetId
// added later would never appear for anyone who picked their user before that
// deploy). The ID is just a lookup key; the actual config is always re-resolved
// fresh from userConfig.ts's live USERS list on every load.
const LS_KEY = 'kr_dashboard_user_id';

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<UserConfig | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const id = localStorage.getItem(LS_KEY);
      if (id) {
        const fresh = getUser(id);
        if (fresh) setUserState(fresh);
      }
    } catch {}
    setReady(true);
  }, []);

  function setUser(u: UserConfig | null) {
    setUserState(u);
    if (u) localStorage.setItem(LS_KEY, u.id);
    else localStorage.removeItem(LS_KEY);
  }

  function clearUser() { setUser(null); }

  if (!ready) return null;
  return <Ctx.Provider value={{ user, setUser, clearUser }}>{children}</Ctx.Provider>;
}

export function useUser() { return useContext(Ctx); }
