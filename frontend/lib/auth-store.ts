"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { auth, onUnauthenticated, setAccessToken } from "./api";
import type { User } from "./types";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  user: User | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "loading",
  login: async (email, password) => {
    const res = await auth.login(email, password);
    setAccessToken(res.access_token);
    set({ user: res.user, status: "authenticated" });
  },
  register: async (email, password, name) => {
    const res = await auth.register(email, password, name);
    setAccessToken(res.access_token);
    set({ user: res.user, status: "authenticated" });
  },
  logout: async () => {
    await auth.logout().catch(() => {});
    setAccessToken(null);
    set({ user: null, status: "unauthenticated" });
  },
}));

// Runs exactly once per page load (module-level guard, not per-component
// mount), since there's no Provider tree to hang a single root effect off
// of — every caller of useAuth() would otherwise race to bootstrap. Mirrors
// the old AuthProvider's mount effect: silently resume a session from the
// httpOnly refresh cookie, and listen for a global 401 to force logout.
let bootstrapped = false;
export function ensureAuthBootstrapped() {
  if (bootstrapped) return;
  bootstrapped = true;

  auth
    .refresh()
    .then((res) => {
      if (res) {
        setAccessToken(res.access_token);
        useAuthStore.setState({ user: res.user, status: "authenticated" });
      } else {
        useAuthStore.setState({ status: "unauthenticated" });
      }
    })
    .catch(() => {
      useAuthStore.setState({ status: "unauthenticated" });
    });

  onUnauthenticated(() => {
    setAccessToken(null);
    useAuthStore.setState({ user: null, status: "unauthenticated" });
  });
}

export function useAuth() {
  useEffect(() => {
    ensureAuthBootstrapped();
  }, []);
  return useAuthStore();
}
