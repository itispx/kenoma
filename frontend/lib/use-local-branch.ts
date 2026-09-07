"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Doc } from "./types";
import type { SaveStatus } from "./save-status";
import {
  clearBranch,
  loadBranch,
  onExternalSave,
  saveBranch,
  type LocalBranch,
} from "./local-branch";

export type BranchPhase = "checking" | "absent" | "present";

interface BranchPatch {
  title?: string;
  content_markdown?: string;
}

interface BranchSeed {
  base_revision_id: string | null;
  title: string;
  content_markdown: string;
  workstream_id?: string;
  last_change_log_id?: string;
  logged_title?: string;
  logged_content_markdown?: string;
}

/**
 * Owns the browser-held working copy of ONE slot: a branch's workstream id, or
 * the document's initial-draft slot. Loading, seeding, debounced local
 * persistence, discard. Writes go to IndexedDB only; nothing here ever touches
 * the network. A null slot means nothing is checked out (main is being read),
 * and the hook holds no branch at all.
 */
export function useLocalBranch(
  doc: Doc,
  userId: string | undefined,
  slot: string | null,
) {
  const [phaseState, setPhase] = useState<BranchPhase>("checking");
  const [branchState, setBranch] = useState<LocalBranch | null>(null);
  const [statusState, setStatus] = useState<SaveStatus>("idle");
  const [convertedState, setConverted] = useState(false);
  // Which slot the state above actually describes. Until a load resolves for
  // the current slot, everything is derived as empty rather than reset through
  // setState: switching branches must never flash the previous branch's draft.
  const [loadedSlot, setLoadedSlot] = useState<string | null>(null);

  const ready = !!userId && !!slot && loadedSlot === slot;
  const phase: BranchPhase = !userId ? "checking" : !slot ? "absent" : ready ? phaseState : "checking";
  const branch = ready ? branchState : null;
  const status: SaveStatus = ready ? statusState : "idle";
  const converted = ready ? convertedState : false;

  const pending = useRef<BranchPatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  // Latest branch state outside React so timers and listeners never read a
  // stale closure.
  const current = useRef<LocalBranch | null>(null);

  useEffect(() => {
    current.current = branch;
  }, [branch]);

  // Load whatever this browser already holds when the page (or the signed-in
  // user) changes. State updates happen in async continuations only, so the
  // effect body itself never triggers cascading renders.
  useEffect(() => {
    if (!userId || !slot) {
      current.current = null;
      return;
    }
    let cancelled = false;
    loadBranch(userId, slot)
      .then(async (found) => {
        if (cancelled) return;
        // A seed can land while this read is in flight: opening a branch this
        // browser has never held seeds a working copy from its latest
        // checkpoint. That seed is newer than anything the store can return,
        // so the load defers to it instead of wiping it.
        if (current.current?.slot === slot) {
          setLoadedSlot(slot);
          return;
        }
        if (found) {
          const needsConversion =
            found.base_revision_id === null && doc.head_revision_id !== null;
          const ready = needsConversion
            ? {
                ...found,
                base_revision_id: doc.head_revision_id,
                logged_title: doc.title,
                logged_content_markdown: doc.content_markdown,
                updated_at: Date.now(),
              }
            : found;
          let conversionFailed = false;
          if (needsConversion) {
            try {
              await saveBranch(ready);
            } catch {
              conversionFailed = true;
            }
          }
          if (cancelled) return;
          current.current = ready;
          setBranch(ready);
          setPhase("present");
          setStatus(conversionFailed ? "error" : "saved");
          setConverted(needsConversion);
          setLoadedSlot(slot);
        } else {
          current.current = null;
          setBranch(null);
          setPhase("absent");
          setStatus("idle");
          setConverted(false);
          setLoadedSlot(slot);
        }
      })
      .catch(() => {
        // Storage failure means we cannot hold a branch at all; the page
        // stays a reader rather than pretending an edit session is safe.
        if (cancelled || current.current?.slot === slot) return;
        setPhase("absent");
        setLoadedSlot(slot);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, slot, doc.head_revision_id, doc.title, doc.content_markdown]);

  const persist = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    const work = (async () => {
      while (current.current && Object.keys(pending.current).length > 0) {
        const patch = pending.current;
        pending.current = {};
        const next: LocalBranch = {
          ...current.current,
          ...patch,
          updated_at: Date.now(),
        };
        try {
          await saveBranch(next);
          current.current = next;
          setBranch(next);
          setStatus(
            Object.keys(pending.current).length > 0 ? "dirty" : "saved",
          );
        } catch {
          pending.current = { ...patch, ...pending.current };
          setStatus("error");
          break;
        }
      }
    })();
    inFlight.current = work;
    try {
      await work;
    } finally {
      inFlight.current = null;
    }
  }, []);

  const queue = useCallback(
    (patch: BranchPatch) => {
      if (!current.current) return;
      pending.current = { ...pending.current, ...patch };
      setStatus("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void persist().catch(() => {}), 400);
    },
    [persist],
  );

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    await persist();
    if (Object.keys(pending.current).length > 0) {
      throw new Error("local draft could not be saved");
    }
  }, [persist]);

  // Seeds either an initial draft or a branch from main's current head.
  const start = useCallback((seed?: BranchSeed) => {
    if (!userId || !slot) return;
    const seeded: LocalBranch = {
      slot,
      documentId: doc.id,
      userId,
      base_revision_id: seed?.base_revision_id ?? doc.head_revision_id,
      title: seed?.title ?? doc.title,
      content_markdown: seed?.content_markdown ?? doc.content_markdown,
      updated_at: Date.now(),
      workstream_id: seed?.workstream_id,
      last_change_log_id: seed?.last_change_log_id,
      logged_title: seed?.logged_title ?? seed?.title ?? doc.title,
      logged_content_markdown:
        seed?.logged_content_markdown ?? seed?.content_markdown ?? doc.content_markdown,
    };
    current.current = seeded;
    setBranch(seeded);
    setPhase("present");
    setStatus("saved");
    setConverted(false);
    setLoadedSlot(slot);
    void saveBranch(seeded).catch(() => setStatus("error"));
  }, [userId, slot, doc]);

  const attachCheckpoint = useCallback(async (checkpoint: {
    workstream_id?: string;
    last_change_log_id?: string;
    title: string;
    content_markdown: string;
  }) => {
    await flush();
    const base = current.current;
    if (!base) return;
    const next: LocalBranch = {
      ...base,
      workstream_id: checkpoint.workstream_id ?? base.workstream_id,
      last_change_log_id: checkpoint.last_change_log_id,
      logged_title: checkpoint.title,
      logged_content_markdown: checkpoint.content_markdown,
      updated_at: Date.now(),
    };
    await saveBranch(next);
    current.current = next;
    setBranch(next);
    setStatus("saved");
  }, [flush]);

  // Preserves a losing initial draft as a normal branch after another browser
  // wins the race to create main's first version.
  const rebase = useCallback(async (baseRevisionId: string) => {
    await flush();
    const base = current.current;
    if (!base) return;
    const next = {
      ...base,
      base_revision_id: baseRevisionId,
      updated_at: Date.now(),
    };
    await saveBranch(next);
    current.current = next;
    setBranch(next);
    setPhase("present");
    setStatus("saved");
  }, [flush]);

  const discard = useCallback(async () => {
    const owner = userId;
    if (!owner || !slot) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = {};
    if (inFlight.current) await inFlight.current.catch(() => {});
    try {
      await clearBranch(owner, slot);
    } catch (error) {
      setStatus("error");
      throw error;
    }
    current.current = null;
    setBranch(null);
    setPhase("absent");
    setStatus("idle");
    setConverted(false);
  }, [userId, slot]);

  // Another tab saved this same branch: reload it so both views agree.
  useEffect(() => {
    if (!userId || !slot) return;
    return onExternalSave(async (otherUser, otherSlot) => {
      if (otherUser !== userId || otherSlot !== slot) return;
      const found = await loadBranch(userId, slot).catch(() => null);
      if (found && !current.current) {
        current.current = found;
        setBranch(found);
        setPhase("present");
        setStatus("saved");
      }
    });
  }, [userId, slot]);

  // Flush on tab hide (the last reliable moment on mobile) and on unmount.
  // The dirty check reads a ref, so the listeners subscribe once instead of
  // churning on every keystroke.
  const statusRef = useRef<SaveStatus>("idle");
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (statusRef.current === "dirty") e.preventDefault();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("beforeunload", onBeforeUnload);
      void flush();
    };
  }, [flush]);

  // The freshest branch state without waiting on React's next render. The
  // Change Request submit path needs this after an awaited flush.
  const getLatest = useCallback(() => current.current, []);

  return {
    phase,
    branch,
    status,
    converted,
    start,
    attachCheckpoint,
    rebase,
    discard,
    queue,
    flush,
    getLatest,
  };
}
