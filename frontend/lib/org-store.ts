"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { orgs as orgsApi, setActiveOrgId as setApiActiveOrgId } from "./api";
import { ensureAuthBootstrapped, useAuthStore } from "./auth-store";
import type { Organization } from "./types";

const STORAGE_KEY = "kenoma_active_org_id";

interface OrgState {
  orgs: Organization[];
  activeOrgId: string | null;
  activeOrg: Organization | null;
  loading: boolean;
  setActiveOrgId: (orgId: string | null) => void;
  refreshOrgs: () => Promise<void>;
}

function computeActiveOrg(orgs: Organization[], activeOrgId: string | null) {
  return orgs.find((o) => o.id === activeOrgId) ?? null;
}

// Implements the GitHub-style "one active org at a time" switcher: the
// selection is persisted across navigation/reloads in localStorage, and
// mirrored into the API client so every request carries X-Active-Org-Id.
// null means "personal space", not "no selection yet".
export const useOrgStore = create<OrgState>((set, get) => ({
  orgs: [],
  activeOrgId: null,
  activeOrg: null,
  loading: true,
  setActiveOrgId: (orgId) => {
    setApiActiveOrgId(orgId);
    if (orgId) {
      window.localStorage.setItem(STORAGE_KEY, orgId);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    set({ activeOrgId: orgId, activeOrg: computeActiveOrg(get().orgs, orgId) });
  },
  refreshOrgs: async () => {
    const list = await orgsApi.list();
    set({ orgs: list, activeOrg: computeActiveOrg(list, get().activeOrgId) });
  },
}));

// Reacts to auth status transitions the same way the old ActiveOrgProvider's
// useEffect keyed on `status` did, but via a direct store-to-store
// subscription instead of React Context. `fetchToken` replaces the old
// per-effect `cancelled` closure: it's bumped on every transition so a
// stale in-flight fetch can detect it's been superseded.
let orgBootstrapped = false;
let fetchToken = 0;

function handleAuthStatus(status: "loading" | "authenticated" | "unauthenticated") {
  if (status === "unauthenticated") {
    fetchToken++;
    useOrgStore.getState().setActiveOrgId(null);
    useOrgStore.setState({ orgs: [], loading: false });
    return;
  }
  if (status !== "authenticated") return;

  const myToken = ++fetchToken;
  useOrgStore.setState({ loading: true });
  orgsApi
    .list()
    .then((list) => {
      if (myToken !== fetchToken) return;
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const stillValid = stored && list.some((o) => o.id === stored);
      useOrgStore.setState({ orgs: list });
      useOrgStore.getState().setActiveOrgId(stillValid ? stored : null);
    })
    .finally(() => {
      if (myToken === fetchToken) useOrgStore.setState({ loading: false });
    });
}

function ensureOrgBootstrapped() {
  if (orgBootstrapped) return;
  orgBootstrapped = true;

  ensureAuthBootstrapped();
  handleAuthStatus(useAuthStore.getState().status);
  useAuthStore.subscribe((state, prev) => {
    if (state.status !== prev.status) handleAuthStatus(state.status);
  });
}

export function useActiveOrg() {
  useEffect(() => {
    ensureOrgBootstrapped();
  }, []);
  return useOrgStore();
}
