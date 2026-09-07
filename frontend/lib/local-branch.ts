"use client";

// Local branch persistence. A working copy lives ONLY in this browser's
// IndexedDB, per SPEC.md: nothing touches the network while the author edits,
// which also means the work is device-bound and clearing site data destroys
// it. Those consequences were accepted for v1; the mitigations are the
// dirty-on-unload guard and the resume banner.
//
// Records are keyed by user and *slot*, not by document. A slot is either a
// branch's workstream id or `<documentId>:initial` for the draft that exists
// before a document has any saved version. That is what lets one document
// hold several branches at once and lets switching between them keep each
// one's uncommitted work.

export interface LocalBranch {
  // The workstream id, or `<documentId>:initial` before main exists.
  slot: string;
  documentId: string;
  userId: string;
  // The main revision this branch seeded from. Sent with the Change Request
  // so the merger can tell when main has drifted underneath the proposal.
  // Null identifies the editable first version before main exists.
  base_revision_id: string | null;
  title: string;
  content_markdown: string;
  updated_at: number;
  workstream_id?: string;
  last_change_log_id?: string;
  logged_title?: string;
  logged_content_markdown?: string;
}

const DB_NAME = "kenoma";
// v2 rekeyed records from user+document to user+slot. A v1 record names no
// branch, so there is nothing to migrate it onto; the upgrade drops the store
// rather than stranding drafts under keys nothing will ever read.
const DB_VERSION = 2;
const STORE = "branches";
const CHANNEL = "kenoma-local-branch";

function key(userId: string, slot: string): string {
  return `${userId}:${slot}`;
}

// The slot a document's pre-first-version draft lives in. It has no branch of
// its own: there is no revision yet to branch from.
export function initialSlot(documentId: string): string {
  return `${documentId}:initial`;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (req.result.objectStoreNames.contains(STORE)) {
        req.result.deleteObjectStore(STORE);
      }
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB unavailable"));
  });
  return dbPromise;
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = run(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB write failed"));
  });
}

export async function loadBranch(
  userId: string,
  slot: string,
): Promise<LocalBranch | null> {
  const value = await withStore<LocalBranch | undefined>("readonly", (s) =>
    s.get(key(userId, slot)),
  );
  return value ?? null;
}

export async function saveBranch(branch: LocalBranch): Promise<void> {
  await withStore("readwrite", (s) =>
    s.put(branch, key(branch.userId, branch.slot)),
  );
  broadcast(branch);
}

export async function clearBranch(
  userId: string,
  slot: string,
): Promise<void> {
  await withStore("readwrite", (s) => s.delete(key(userId, slot)));
}

// Which of this document's branches this browser holds unsent work for. The
// branch list marks those, since that draft exists on no other device and in
// no other browser.
export async function listLocalSlots(
  userId: string,
  documentId: string,
): Promise<string[]> {
  const all = await withStore<LocalBranch[]>("readonly", (s) => s.getAll());
  return all
    .filter((b) => b.userId === userId && b.documentId === documentId)
    .map((b) => b.slot);
}

// Other tabs editing the same document need to know a write happened, since
// IndexedDB fires no events across connections.
function broadcast(branch: LocalBranch) {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage({ userId: branch.userId, slot: branch.slot });
  channel.close();
}

// Subscribes to saves made by other tabs. Returns an unsubscribe function.
export function onExternalSave(
  cb: (userId: string, slot: string) => void,
): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event: MessageEvent) => {
    const data = event.data as { userId?: string; slot?: string };
    if (data?.userId && data?.slot) cb(data.userId, data.slot);
  };
  return () => channel.close();
}
