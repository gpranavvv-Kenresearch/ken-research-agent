'use client';
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { UserConfig } from '@/lib/userConfig';

interface UserCtx {
  user: UserConfig | null;
  setUser: (u: UserConfig | null) => void;
  clearUser: () => void;
}

const Ctx = createContext<UserCtx>({ user: null, setUser: () => {}, clearUser: () => {} });

const LS_KEY = 'kr_dashboard_user';

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<UserConfig | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as UserConfig;
        setUserState(parsed);
      }
    } catch {}
    setReady(true);
  }, []);

  function setUser(u: UserConfig | null) {
    setUserState(u);
    if (u) localStorage.setItem(LS_KEY, JSON.stringify(u));
    else localStorage.removeItem(LS_KEY);
  }

  function clearUser() { setUser(null); }

  if (!ready) return null;
  return <Ctx.Provider value={{ user, setUser, clearUser }}>{children}</Ctx.Provider>;
}

export function useUser() { return useContext(Ctx); }
