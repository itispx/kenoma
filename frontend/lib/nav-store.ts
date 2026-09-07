"use client";

// Which project/document the user is currently on, so the app shell's sidebar
// can highlight and auto-expand the right rows. The layouts live *below* the
// shell, so React context can't carry this upward; a module store can, same
// pattern as auth-store.
//
// Only orgId survives a reload (localStorage via zustand's persist): it is
// what lets /dashboard and a cold load on a document still paint a useful
// tree. projectId/documentId are per-page and reset every visit.

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface NavState {
  orgId: string | null;
  projectId: string | null;
  documentId: string | null;
  setOrgId: (orgId: string | null) => void;
  setProjectId: (projectId: string | null) => void;
  setDocumentId: (documentId: string | null) => void;
}

export const useNavStore = create<NavState>()(
  persist(
    (set) => ({
      orgId: null,
      projectId: null,
      documentId: null,
      setOrgId: (orgId) => set({ orgId }),
      setProjectId: (projectId) => set({ projectId }),
      setDocumentId: (documentId) => set({ documentId }),
    }),
    {
      name: "kenoma:active-org",
      partialize: (state) => ({ orgId: state.orgId }),
    },
  ),
);