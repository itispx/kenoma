"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Suspense,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, EllipsisVertical } from "lucide-react";
import { ApiError, changeRequests, documents, workstreams } from "@/lib/api";
import type {
  ChangeLog,
  ChangeRequestSummary,
  DiffSpan,
  Doc,
  Revision,
  RevisionSummary,
  Workstream,
  WorkstreamSummary,
} from "@/lib/types";
import { useLocalBranch } from "@/lib/use-local-branch";
import { initialSlot, listLocalSlots } from "@/lib/local-branch";
import { useAuth } from "@/lib/auth-store";
import { useNavStore } from "@/lib/nav-store";
import { usePermissions } from "@/lib/use-permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DocumentViewer } from "@/components/document-viewer";
import { DiffView } from "@/components/diff-view";
import { BranchesPanel } from "@/components/branches-panel";
import { CrStatusBadge } from "@/components/cr-status-badge";
import { ImportDialog } from "@/components/import-dialog";
import { inputClass, primaryBtn } from "@/components/auth-shell";
import {
  ErrorState,
  LoadingState,
  notFoundCopy,
} from "@/components/page-state";

// Code-split: the editor and its Markdown machinery are the largest bundle in
// the app, and readers should never pay for them.
const BranchEditor = dynamic(
  () => import("@/components/editor/branch-editor").then((m) => m.BranchEditor),
  { ssr: false, loading: () => <LoadingState label="Loading editor…" /> },
);

export default function DocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = use(params);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState("");
  const { setDocumentId, setProjectId } = useNavStore();
  // The sidebar highlights this document and auto-expands its project.
  useEffect(() => {
    if (!doc) return;
    setProjectId(doc.project_id);
    setDocumentId(doc.id);
    return () => {
      if (useNavStore.getState().projectId === doc.project_id) {
        setProjectId(null);
      }
      if (useNavStore.getState().documentId === doc.id) {
        setDocumentId(null);
      }
    };
  }, [doc, setDocumentId, setProjectId]);
  useEffect(() => {
    documents
      .get(documentId)
      .then(setDoc)
      .catch((e) =>
        setError(
          e instanceof ApiError && e.status === 404
            ? notFoundCopy
            : "Could not load this document.",
        ),
      );
  }, [documentId]);
  if (error) return <ErrorState message={error} />;
  if (!doc) return <LoadingState label="Loading document…" />;
  // The view reads the checked-out branch from the query string, and
  // useSearchParams needs a boundary to suspend against.
  return (
    <Suspense fallback={<LoadingState label="Loading document…" />}>
      <DocumentView key={doc.id} doc={doc} onDocumentChange={setDoc} />
    </Suspense>
  );
}

type Tab = "main" | "history" | "activity";

function DocumentView({
  doc,
  onDocumentChange,
}: {
  doc: Doc;
  onDocumentChange: (doc: Doc) => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const { has, loading } = usePermissions(doc.project_id);
  const canEdit = !loading && has("docs:edit");
  const canImport = !loading && has("docs:import");
  const canSubmit = !loading && has("docs:submit_review");
  const canManage = !loading && has("docs:manage");
  const canApprove = !loading && has("docs:approve");
  const canExport = !loading && has("docs:export");

  const initialDraft = doc.head_revision_id === null;

  const [branches, setBranches] = useState<WorkstreamSummary[] | null>(null);

  // Which branch is checked out lives in the URL, by name, so a branch view is
  // a link someone can send. Null is main, which is read-only by design.
  // Before the first version exists there is nothing to branch from, so the
  // document's initial-draft slot stands in for one.
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const branchParam = searchParams.get("branch");
  const currentSummary = useMemo(() => {
    if (!branchParam || !branches) return null;
    // Names are unique among live branches but an abandoned one may still
    // hold the same name, so a live branch always wins the lookup.
    const named = branches.filter((b) => b.name === branchParam);
    return (
      named.find((b) => b.status === "active") ??
      named.find((b) => b.status === "submitted") ??
      named[0] ??
      null
    );
  }, [branchParam, branches]);
  const currentBranchId = currentSummary?.id ?? null;
  const slot = initialDraft ? initialSlot(doc.id) : currentBranchId;

  const selectBranch = useCallback(
    (branchId: string | null) => {
      const target = branchId
        ? (branches ?? []).find((b) => b.id === branchId)
        : undefined;
      const params = new URLSearchParams(searchParams.toString());
      if (target) params.set("branch", target.name);
      else params.delete("branch");
      const query = params.toString();
      // replace, not push: switching branches is changing what you are looking
      // at, not a step Back should walk through one branch at a time.
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [branches, searchParams, router, pathname],
  );

  const [branch, setBranch] = useState<Workstream | null>(null);
  const [localSlots, setLocalSlots] = useState<string[]>([]);
  const [selectedLog, setSelectedLog] = useState<ChangeLog | null>(null);
  const [logDiff, setLogDiff] = useState<DiffSpan[] | null>(null);

  const branchCtl = useLocalBranch(doc, user?.id, slot);
  // A stored draft is not automatically an editing session: returning to the
  // page shows the resume banner first, so nobody lands mid-edit by surprise.
  const hasBranch = branchCtl.phase === "present" && !!branchCtl.branch;
  const [editingMode, setEditingMode] = useState(false);
  const editing = hasBranch && (editingMode || initialDraft);
  const startBranch = branchCtl.start;
  const isOwner = !!branch && branch.owner_id === user?.id;

  const [tab, setTab] = useState<Tab>("main");
  const [branchModal, setBranchModal] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [openAfterCreate, setOpenAfterCreate] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [importRevisionOpen, setImportRevisionOpen] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [confirmingCloseReview, setConfirmingCloseReview] = useState(false);
  const [revisions, setRevisions] = useState<RevisionSummary[] | null>(null);
  const [crsList, setCrsList] = useState<ChangeRequestSummary[] | null>(null);
  const [selectedRev, setSelectedRev] = useState<Revision | null>(null);
  const [revDiff, setRevDiff] = useState<DiffSpan[] | null>(null);
  const [showRedline, setShowRedline] = useState(false);
  const [initialConflict, setInitialConflict] = useState<string | null>(null);
  const [workstreamConflict, setWorkstreamConflict] = useState(false);
  const [submitReviewOpen, setSubmitReviewOpen] = useState(false);
  const [submitDiff, setSubmitDiff] = useState<DiffSpan[] | null>(null);
  const [submittingWorkstream, setSubmittingWorkstream] = useState(false);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [reconcileTitle, setReconcileTitle] = useState("");
  const [reconcileContent, setReconcileContent] = useState("");
  const [reconcileDiff, setReconcileDiff] = useState<DiffSpan[] | null>(null);
  // "docx" | "pdf" | null. Non-null while an export is downloading, so the
  // two buttons can show which one is being prepared.
  const [exporting, setExporting] = useState<"docx" | "pdf" | null>(null);

  // Hands a downloaded file to the browser's save dialog, using the filename
  // the backend chose via Content-Disposition.
  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function exportRevision(format: "docx" | "pdf") {
    if (!selectedRev) return;
    setExporting(format);
    try {
      const { blob, filename } = await documents.revisions.export(
        doc.id,
        selectedRev.id,
        format,
      );
      triggerDownload(blob, filename);
    } catch {
      toast.error("Could not export this revision.");
    } finally {
      setExporting(null);
    }
  }

  const refreshChangeRequests = useCallback(async () => {
    const list = await changeRequests.listForDocument(doc.id).catch(() => null);
    if (list) setCrsList(list);
  }, [doc.id]);

  const refreshBranches = useCallback(async () => {
    if (initialDraft) return;
    const list = await workstreams.list(doc.id).catch(() => null);
    if (list) setBranches(list);
  }, [doc.id, initialDraft]);

  useEffect(() => {
    if (initialDraft) return;
    let cancelled = false;
    void (async () => {
      const list = await workstreams.list(doc.id).catch(() => null);
      if (!cancelled && list) setBranches(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc.id, initialDraft]);

  // Which branches this browser holds unsent work for. That draft exists on no
  // other device, so the switcher has to say so before someone leaves it. It is
  // re-read whenever the local save status settles, since that is exactly when
  // a slot gains or loses its draft.
  const userId = user?.id;
  const saveStatus = branchCtl.status;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const slots = await listLocalSlots(userId, doc.id).catch(() => null);
      if (!cancelled && slots) setLocalSlots(slots);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, doc.id, saveStatus]);

  const refreshLocalSlots = useCallback(async () => {
    if (!userId) return;
    const slots = await listLocalSlots(userId, doc.id).catch(() => null);
    if (slots) setLocalSlots(slots);
  }, [userId, doc.id]);

  const loadBranchDetail = useCallback(async () => {
    if (!currentBranchId) {
      setBranch(null);
      return null;
    }
    const detail = await workstreams
      .get(doc.id, currentBranchId)
      .catch(() => null);
    if (!detail) {
      toast.error("Could not load that branch.");
      return null;
    }
    setBranch(detail);
    return detail;
  }, [doc.id, currentBranchId]);

  // Switching branches reloads the detail and drops the open redline, since a
  // log id from the previous branch means nothing on this one. State lands in
  // the async continuation so the switch costs one render, not three.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const detail = currentBranchId
        ? await workstreams.get(doc.id, currentBranchId).catch(() => null)
        : null;
      if (cancelled) return;
      setSelectedLog(null);
      setLogDiff(null);
      setBranch(detail);
      if (currentBranchId && !detail)
        toast.error("Could not load that branch.");
    })();
    return () => {
      cancelled = true;
    };
  }, [doc.id, currentBranchId]);

  useEffect(() => {
    if (!initialDraft || !canEdit || branchCtl.phase !== "absent") return;
    startBranch();
  }, [initialDraft, canEdit, branchCtl.phase, startBranch]);

  // A branch created a moment ago. Once the URL has resolved back to its slot
  // and the loader has confirmed this browser holds nothing for it, seed the
  // working copy from main and open the editor. A new branch has no
  // checkpoints, so main's head is the only sensible starting content.
  useEffect(() => {
    if (!openAfterCreate || !branch || branch.id !== currentBranchId) return;
    if (branchCtl.phase !== "absent") return;
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      setOpenAfterCreate(false);
      startBranch({
        base_revision_id: branch.base_revision_id,
        title: doc.title,
        content_markdown: doc.content_markdown,
        workstream_id: branch.id,
        logged_title: doc.title,
        logged_content_markdown: doc.content_markdown,
      });
      setEditingMode(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    openAfterCreate,
    branch,
    currentBranchId,
    branchCtl.phase,
    startBranch,
    doc.title,
    doc.content_markdown,
  ]);

  // What the checked-out branch currently holds. For its owner that is the
  // working copy in this browser, which is the honest answer to "what is on my
  // branch"; for everyone else it is the last saved checkpoint, since the
  // owner's unsent edits exist on no server. With no checkpoints at all it is
  // the revision the branch started from.
  const latestLog = branch?.change_logs.at(-1);
  const [baseContent, setBaseContent] = useState<string | null>(null);
  useEffect(() => {
    if (!branch || latestLog) return;
    let cancelled = false;
    void (async () => {
      const revision = await documents.revisions
        .get(doc.id, branch.base_revision_id)
        .catch(() => null);
      if (!cancelled) setBaseContent(revision?.content_markdown ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc.id, branch, latestLog]);

  useEffect(() => {
    if (tab === "history" && revisions === null) {
      documents.revisions
        .list(doc.id)
        .then(setRevisions)
        .catch(() => toast.error("Could not load history."));
    }
  }, [tab, doc.id, revisions]);

  // Loaded up front rather than with the Change requests tab: the branches
  // panel needs it to point a submitted branch at the review that froze it.
  useEffect(() => {
    if (initialDraft) return;
    let cancelled = false;
    void (async () => {
      const list = await changeRequests
        .listForDocument(doc.id)
        .catch(() => null);
      if (!cancelled && list) setCrsList(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc.id, initialDraft]);

  async function selectRevision(rev: RevisionSummary) {
    setShowRedline(false);
    setRevDiff(null);
    try {
      const full = await documents.revisions.get(doc.id, rev.id);
      setSelectedRev(full);
      const previous = (revisions ?? []).find((r) => r.seq === rev.seq - 1);
      if (previous) {
        documents.revisions
          .diff(doc.id, previous.id, rev.id)
          .then(setRevDiff)
          .catch(() => {});
      } else {
        setRevDiff([]);
      }
    } catch {
      toast.error("Could not load that revision.");
    }
  }

  // Each checkpoint against the one before it, which is the only reading of
  // "what changed here" that survives later checkpoints landing on top.
  async function selectLog(log: ChangeLog) {
    if (!currentBranchId) return;
    if (selectedLog?.id === log.id) {
      setSelectedLog(null);
      setLogDiff(null);
      return;
    }
    setSelectedLog(log);
    setLogDiff(null);
    const spans = await workstreams
      .diff(doc.id, currentBranchId, log.id)
      .catch(() => null);
    setLogDiff(spans ?? []);
  }

  async function createBranch() {
    const name = branchName.trim();
    if (!name || !doc.head_revision_id) return;
    setCreatingBranch(true);
    try {
      const created = await workstreams.create(
        doc.id,
        name,
        doc.head_revision_id,
      );
      setBranchModal(false);
      setBranchName("");
      setBranch(created);
      await refreshBranches();
      // The branch is checked out by writing the URL, so the working copy can
      // only be seeded once that resolves back to a slot. openAfterCreate
      // carries the intent across that gap.
      setOpenAfterCreate(true);
      router.replace(`${pathname}?branch=${encodeURIComponent(created.name)}`, {
        scroll: false,
      });
    } catch (error) {
      toast.error(
        error instanceof ApiError && error.status === 409
          ? "A branch with that name already exists on this document."
          : "Could not create the branch.",
      );
    } finally {
      setCreatingBranch(false);
    }
  }

  async function saveChangeLog(message: string) {
    if (!branch) return;
    try {
      await branchCtl.flush();
      const latest = branchCtl.getLatest();
      if (!latest) return;
      const created = await workstreams.append(doc.id, branch.id, {
        expected_parent_change_log_id: latest.last_change_log_id,
        message,
        title: latest.title,
        content_markdown: latest.content_markdown,
      });
      setBranch({ ...branch, change_logs: [...branch.change_logs, created] });
      await branchCtl.attachCheckpoint({
        workstream_id: branch.id,
        last_change_log_id: created.id,
        title: created.title,
        content_markdown: created.content_markdown ?? latest.content_markdown,
      });
      setWorkstreamConflict(false);
      void refreshBranches();
      toast.success("Change Log saved.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        await loadBranchDetail();
        setWorkstreamConflict(true);
        toast.warning(
          "A newer Change Log was saved elsewhere. Your draft is safe.",
        );
        throw error;
      }
      toast.error("Could not save the Change Log.");
      throw error;
    }
  }

  async function openChangeRequest() {
    if (!branch || branch.change_logs.length === 0) return;
    try {
      await branchCtl.flush();
      const spans = await workstreams.diff(doc.id, branch.id);
      setSubmitDiff(spans);
      setSubmitReviewOpen(true);
    } catch {
      toast.error("Could not prepare the Change Request.");
    }
  }

  async function submitChangeRequest() {
    const latestLog = branch?.change_logs.at(-1);
    if (!branch || !latestLog) return;
    setSubmittingWorkstream(true);
    try {
      const cr = await changeRequests.open(doc.id, {
        workstream_id: branch.id,
        expected_latest_change_log_id: latestLog.id,
      });
      let cleanupFailed = false;
      try {
        await branchCtl.discard();
      } catch {
        cleanupFailed = true;
      }
      setSubmitReviewOpen(false);
      setEditingMode(false);
      await refreshBranches();
      await loadBranchDetail();
      if (cleanupFailed) {
        toast.warning(
          "Change Request created, but the local draft could not be removed.",
        );
      } else {
        toast.success("Change Request opened for review.");
      }
      router.push(`/change-requests/${cr.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        await loadBranchDetail();
        setSubmitReviewOpen(false);
        setWorkstreamConflict(true);
        toast.warning(
          "The Change Logs changed. Review the latest checkpoint before submitting.",
        );
      } else {
        toast.error("Could not create the Change Request.");
      }
    } finally {
      setSubmittingWorkstream(false);
    }
  }

  async function reconcileWorkstream() {
    const current = await loadBranchDetail();
    const latest = current?.change_logs.at(-1);
    if (!current || !latest) return;
    branchCtl.queue({
      title: reconcileTitle,
      content_markdown: reconcileContent,
    });
    await branchCtl.flush();
    await branchCtl.attachCheckpoint({
      workstream_id: current.id,
      last_change_log_id: latest.id,
      title: latest.title,
      content_markdown: latest.content_markdown ?? "",
    });
    setWorkstreamConflict(false);
    setReconcileOpen(false);
    toast.info("Latest Change Log is now the parent of your preserved draft.");
  }

  async function openReconciliation() {
    const localTitle = branchCtl.branch?.title ?? doc.title;
    const localContent = branchCtl.branch?.content_markdown ?? "";
    setReconcileTitle(localTitle);
    setReconcileContent(localContent);
    setReconcileDiff(null);
    setReconcileOpen(true);
    if (!branch) return;
    const spans = await workstreams
      .reconcileDiff(doc.id, branch.id, localContent)
      .catch(() => null);
    if (spans) setReconcileDiff(spans);
  }

  // Opening a branch that has no working copy on this device seeds one from
  // its latest checkpoint, which is the closest thing to a checkout here.
  async function openEditor() {
    const current = branch ?? (await loadBranchDetail());
    if (!current) return;
    const latest = current.change_logs.at(-1);
    if (!hasBranch) {
      // Seeding while the store is still being read would overwrite a draft
      // this browser already holds, so a click that early does nothing rather
      // than destroying unsent work.
      if (branchCtl.phase === "checking") return;
      startBranch({
        base_revision_id: current.base_revision_id,
        title: latest?.title ?? doc.title,
        content_markdown: latest?.content_markdown ?? doc.content_markdown,
        workstream_id: current.id,
        last_change_log_id: latest?.id,
        logged_title: latest?.title ?? doc.title,
        logged_content_markdown:
          latest?.content_markdown ?? doc.content_markdown,
      });
      setEditingMode(true);
      return;
    }
    if (latest) {
      const localParent = branchCtl.branch?.last_change_log_id;
      if (localParent !== latest.id) {
        setWorkstreamConflict(true);
        setEditingMode(true);
        return;
      }
      await branchCtl.attachCheckpoint({
        workstream_id: current.id,
        last_change_log_id: latest.id,
        title: latest.title,
        content_markdown: latest.content_markdown ?? "",
      });
    }
    setEditingMode(true);
  }

  async function discardBranch() {
    if (branch) {
      await workstreams.abandon(doc.id, branch.id).catch(() => {
        toast.error("Could not abandon the branch on the server.");
      });
    }
    setEditingMode(false);
    await branchCtl.discard();
    setBranch(null);
    selectBranch(null);
    await refreshBranches();
    await refreshLocalSlots();
  }

  async function saveInitialVersion() {
    try {
      await branchCtl.flush();
      const latest = branchCtl.getLatest();
      if (!latest) return;
      const saved = await documents.saveInitialVersion(doc.id, {
        title: latest.title,
        content_markdown: latest.content_markdown,
      });
      let cleanupFailed = false;
      try {
        await branchCtl.discard();
      } catch {
        cleanupFailed = true;
      }
      setEditingMode(cleanupFailed);
      setInitialConflict(
        cleanupFailed
          ? "The first version was saved, but this browser could not remove its local copy. Your content remains visible here so it cannot be lost."
          : null,
      );
      onDocumentChange(saved);
      if (cleanupFailed) {
        toast.warning(
          "First version saved, but local cleanup needs attention.",
        );
      } else {
        toast.success("First version saved.");
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        try {
          const current = await documents.get(doc.id);
          if (!current.head_revision_id) throw new Error("head unavailable");
          await branchCtl.rebase(current.head_revision_id);
          await branchCtl.attachCheckpoint({
            title: current.title,
            content_markdown: current.content_markdown,
          });
          setEditingMode(true);
          onDocumentChange(current);
          setInitialConflict(
            "Another editor saved the first version. Your work is safe and is now a private branch based on main.",
          );
          toast.info("Your draft was converted to a private branch.");
          return;
        } catch {
          toast.error(
            "Main changed, but your local draft could not be converted.",
          );
          return;
        }
      }
      toast.error("Could not save the first version.");
    }
  }

  // Ends the review from here rather than making the author walk to the Change
  // Request page: the branch is what they came back for, and closing is the
  // only thing standing between them and it.
  async function closeReview() {
    if (!branchReview) return;
    try {
      await changeRequests.close(branchReview.id, "");
      await refreshChangeRequests();
      await refreshBranches();
      await loadBranchDetail();
      toast.success("Change Request closed. The branch is editable again.");
    } catch {
      toast.error("Could not close the Change Request.");
    }
  }

  async function importRevision(file: File) {
    const cr = await documents.importRevision(doc.id, file);
    setImportRevisionOpen(false);
    router.push(`/change-requests/${cr.id}`);
  }

  async function remove() {
    try {
      await documents.remove(doc.id);
      router.push(`/projects/${doc.project_id}`);
    } catch {
      toast.error("Could not delete this document.");
    }
  }

  // The most recent outcome of this user's own proposals, so the banner can
  // say what happened to their work while they were away.
  const myOutcome = crsList?.find(
    (c) => !!user && c.opened_by === user.id && c.status !== "open",
  );
  // The Change Request that sealed this branch, if one did.
  // A branch can carry several Change Requests over its life: closing one
  // hands the branch back, and a later submission opens another. The open one
  // is the review that is sealing it right now.
  const branchReviews = currentBranchId
    ? (crsList ?? []).filter((c) => c.workstream_id === currentBranchId)
    : [];
  const branchReview =
    branchReviews.find((c) => c.status === "open") ?? branchReviews[0];
  const workingCopy = isOwner ? branchCtl.branch : null;
  const branchMarkdown = branch
    ? (workingCopy?.content_markdown ??
      latestLog?.content_markdown ??
      baseContent ??
      doc.content_markdown)
    : doc.content_markdown;
  const branchViewNote = !branch
    ? "Main is read-only. Changes happen on branches and reach main through reviewed Change Requests."
    : workingCopy
      ? `Your working copy on ${branch.name}, held in this browser. Main is untouched until a Change Request merges.`
      : latestLog
        ? `${branch.name}, as of Change Log #${latestLog.seq}. Main is untouched until a Change Request merges.`
        : `${branch.name} has no Change Logs yet, so it still matches the revision it started from.`;
  const hasUnloggedChanges =
    !!branchCtl.branch &&
    (branchCtl.branch.title !== (branchCtl.branch.logged_title ?? doc.title) ||
      branchCtl.branch.content_markdown !==
        (branchCtl.branch.logged_content_markdown ?? doc.content_markdown));

  const sealed = currentSummary?.status === "submitted";
  // Only its owner deletes a branch, and only while it is live: a sealed one
  // belongs to the review, and the server refuses to abandon it anyway.
  const canDeleteBranch =
    !!currentSummary &&
    currentSummary.status === "active" &&
    currentSummary.owner_id === user?.id;
  // Same rule the server enforces: the author of the review, or anyone the
  // project trusts to approve.
  const canCloseReview =
    !!branchReview &&
    branchReview.status === "open" &&
    (branchReview.opened_by === user?.id || canApprove);

  return (
    <div>
      {/* The one thing that changes what every control on this page will do,
          so it comes before the document itself rather than as a note beside
          a button that is quietly missing. */}
      {sealed && !editing && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-signal-warning/40 bg-signal-warning/10 px-gutter py-3 text-sm text-console-100">
          <span>
            <span className="font-mono">{currentSummary?.name}</span> is in
            review and cannot be edited. Its Change Logs are what the reviewer
            is reading, so they stay frozen until the Change Request merges or
            closes.
          </span>
          <div className="flex shrink-0 items-center gap-4">
            {branchReview && (
              <Link
                href={`/change-requests/${branchReview.id}`}
                className="focus-console rounded-sm px-2 py-1 text-xs font-semibold whitespace-nowrap text-signal-warning underline-offset-4 hover:underline"
              >
                Open Change Request
              </Link>
            )}
            {canCloseReview && (
              <button
                onClick={() => setConfirmingCloseReview(true)}
                className="focus-console rounded-sm border border-signal-warning/50 px-2 py-1 text-xs font-semibold whitespace-nowrap text-signal-warning hover:border-signal-warning"
              >
                Close Change Request
              </button>
            )}
          </div>
        </div>
      )}

      {/* --- Header (hidden while editing: the branch brings its own header,
              and document-level navigation and deletion are not moves anyone
              should make from inside an open draft) --- */}
      {!editing && (
        <div className="mb-2 flex items-center gap-3">
          <Link
            href={`/projects/${doc.project_id}`}
            aria-label="Back to project"
            className="focus-console flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-console-400 hover:text-console-100"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </Link>
          <h1 className="min-w-0 truncate text-base font-semibold">
            {doc.title}
          </h1>
          {initialDraft && (
            <span className="shrink-0 rounded-[4px] border border-console-600 px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-console-300">
              Initial draft
            </span>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {(canManage || canDeleteBranch) && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      aria-label="Document actions"
                      className="focus-console flex h-8 w-8 items-center justify-center rounded-sm text-console-400 hover:text-console-100"
                    >
                      <EllipsisVertical className="h-4 w-4" aria-hidden />
                    </button>
                  }
                />
                <DropdownMenuContent align="end">
                  {/* With a branch checked out, the destructive action in
                      reach is the branch, not the document underneath it. */}
                  {canDeleteBranch ? (
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setConfirmingDiscard(true)}
                    >
                      Delete branch
                    </DropdownMenuItem>
                  ) : (
                    canManage && (
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setConfirmingDelete(true)}
                      >
                        Delete document
                      </DropdownMenuItem>
                    )
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}

      {/* --- Tabs (hidden while editing; the branch owns the page then) --- */}
      {!editing && !initialDraft && (
        <nav
          className="mb-3 flex gap-1 border-b border-console-600/60"
          role="tablist"
        >
          {(
            [
              ["main", "Document"],
              ["history", "History"],
              ["activity", "Change requests"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`focus-console rounded-t-sm px-3 py-1.5 text-xs font-semibold tracking-wide ${
                tab === key
                  ? "border-b-2 border-signal-info text-console-50"
                  : "text-console-400 hover:text-console-100"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      )}

      {!editing && !initialDraft && (
        <BranchesPanel
          branches={branches}
          currentBranchId={currentBranchId}
          currentBranch={branch}
          localSlots={localSlots}
          userId={user?.id}
          canCreate={canEdit}
          canImport={canImport}
          onSelect={selectBranch}
          onCreate={() => setBranchModal(true)}
          onImport={() => setImportRevisionOpen(true)}
          onEdit={() => void openEditor()}
          logDiff={logDiff}
          selectedLogId={selectedLog?.id ?? null}
          onSelectLog={(log) => void selectLog(log)}
        />
      )}

      {/* --- Editing mode --- */}
      {editing && branchCtl.branch ? (
        <BranchEditor
          branch={branchCtl.branch}
          branchName={branch?.name}
          saveStatus={branchCtl.status}
          canSubmitReview={canSubmit}
          onPatch={branchCtl.queue}
          onBack={() => setEditingMode(false)}
          onDiscard={() => setConfirmingDiscard(true)}
          onOpenChangeRequest={openChangeRequest}
          mode={initialDraft ? "initial" : "branch"}
          onSaveInitialVersion={saveInitialVersion}
          conflictNotice={
            (workstreamConflict
              ? "Another device saved a newer Change Log. Your local draft has not been changed. Reconcile before saving again."
              : initialConflict) ??
            (branchCtl.converted
              ? "Main was saved elsewhere. Your initial draft is safe and is now a private branch based on main."
              : null)
          }
          changeLogs={branch?.change_logs ?? []}
          hasUnloggedChanges={hasUnloggedChanges}
          onSaveChangeLog={saveChangeLog}
          onResolveConflict={
            workstreamConflict ? openReconciliation : undefined
          }
        />
      ) : (
        <>
          {hasBranch && isOwner && (
            <div className="surface-panel mb-3 p-gutter">
              <p className="text-sm text-console-100">
                You have unsent work on this branch, held in this browser.
              </p>
              {myOutcome && (
                <p className="mt-1 text-xs text-console-300">
                  Your earlier Change Request was{" "}
                  {myOutcome.status === "merged"
                    ? "merged into main."
                    : "closed without merging."}
                </p>
              )}
              <div className="mt-3 flex gap-3">
                <button
                  onClick={() => void openEditor()}
                  className="focus-console rounded-sm bg-console-700 px-2 py-1 text-xs font-semibold text-console-100"
                >
                  Resume editing
                </button>
                <button
                  onClick={() => setConfirmingDiscard(true)}
                  className="focus-console rounded-sm px-1 py-1 text-xs text-console-300 underline-offset-4 hover:text-console-100 hover:underline"
                >
                  Discard it
                </button>
              </div>
            </div>
          )}

          {initialDraft && (
            <div className="surface-panel p-gutter-lg">
              <p className="text-sm text-console-100">Initial draft</p>
              <p className="mt-1 text-xs text-console-300">
                This document does not have a saved version yet.
              </p>
            </div>
          )}

          {!initialDraft && tab === "main" && (
            <div className="surface-panel p-gutter-lg">
              <DocumentViewer markdown={branchMarkdown} />
              <p className="mt-6 border-t border-console-600/60 pt-3 text-xs text-console-400">
                {branchViewNote}
              </p>
            </div>
          )}

          {!initialDraft && tab === "history" && (
            <div className="space-y-3">
              <ul className="surface-panel divide-y divide-console-600/60">
                {(revisions ?? []).map((rev) => (
                  <li key={rev.id}>
                    <button
                      onClick={() => void selectRevision(rev)}
                      className={`row-hover focus-console flex w-full items-baseline justify-between gap-4 px-gutter py-3 text-left ${
                        selectedRev?.id === rev.id ? "bg-console-700/50" : ""
                      }`}
                    >
                      <span className="font-mono text-xs text-console-200">
                        #{rev.seq}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-console-50">
                        {rev.title}
                      </span>
                      <span className="font-mono text-xs text-console-400">
                        {rev.created_at.slice(0, 16).replace("T", " ")}
                      </span>
                    </button>
                  </li>
                ))}
                {revisions !== null && revisions.length === 0 && (
                  <li className="px-gutter py-3 text-sm text-console-300">
                    No revisions yet.
                  </li>
                )}
              </ul>
              {revisions === null && <LoadingState label="Loading history…" />}
              {selectedRev && (
                <div className="surface-panel p-gutter-lg">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold">
                      #{selectedRev.seq} · {selectedRev.title}
                    </h2>
                    <div className="flex items-center gap-3">
                      {revDiff !== null && revDiff.length > 0 && (
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-console-300">
                          <input
                            type="checkbox"
                            checked={showRedline}
                            onChange={(e) => setShowRedline(e.target.checked)}
                            // The browser's default checkbox ships in its own
                            // palette; accent-color hands it back to the console.
                            className="h-3.5 w-3.5 accent-signal-info"
                          />
                          Redline vs previous
                        </label>
                      )}
                      {canExport && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={exporting !== null}
                            onClick={() => void exportRevision("docx")}
                            className="focus-console rounded-sm border border-console-600 px-2 py-1 text-xs font-semibold text-console-100 hover:border-console-400 disabled:opacity-40"
                          >
                            {exporting === "docx" ? "Exporting…" : "Export .docx"}
                          </button>
                          <button
                            type="button"
                            disabled={exporting !== null}
                            onClick={() => void exportRevision("pdf")}
                            className="focus-console rounded-sm border border-console-600 px-2 py-1 text-xs font-semibold text-console-100 hover:border-console-400 disabled:opacity-40"
                          >
                            {exporting === "pdf" ? "Exporting…" : "Export .pdf"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {showRedline && revDiff ? (
                    <DiffView
                      spans={revDiff}
                      emptyCopy="Identical to the previous revision."
                    />
                  ) : (
                    <DocumentViewer markdown={selectedRev.content_markdown} />
                  )}
                </div>
              )}
            </div>
          )}

          {!initialDraft && tab === "activity" && (
            <ul className="surface-panel divide-y divide-console-600/60">
              {(crsList ?? []).map((cr) => (
                <li key={cr.id}>
                  <Link
                    href={`/change-requests/${cr.id}`}
                    className="row-hover focus-console flex items-center gap-3 px-gutter py-3"
                  >
                    <CrStatusBadge status={cr.status} />
                    <span className="min-w-0 flex-1 truncate text-sm text-console-50">
                      {cr.title}
                    </span>
                    {cr.kind === "import" && (
                      <span className="font-mono text-xs text-console-400">
                        import
                      </span>
                    )}
                    <span className="font-mono text-xs text-console-400">
                      {cr.updated_at.slice(0, 16).replace("T", " ")}
                    </span>
                  </Link>
                </li>
              ))}
              {crsList !== null && crsList.length === 0 && (
                <li className="px-gutter py-3 text-sm text-console-300">
                  No Change Requests yet.
                </li>
              )}
            </ul>
          )}
        </>
      )}

      {/* --- Dialogs --- */}
      <Dialog open={branchModal} onOpenChange={setBranchModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New branch</DialogTitle>
            <DialogDescription>
              Main cannot be edited directly. A branch carries your changes
              until a Change Request merges them; its name is how everyone else
              on the project refers to it.
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="branch-name" className="text-xs text-console-300">
            Branch name
          </label>
          <input
            id="branch-name"
            autoFocus
            maxLength={80}
            value={branchName}
            onChange={(event) => setBranchName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && branchName.trim()) {
                event.preventDefault();
                void createBranch();
              }
            }}
            placeholder="rewrite-intro"
            className={`${inputClass} w-full font-mono`}
          />
          <DialogFooter>
            <button
              type="button"
              onClick={() => setBranchModal(false)}
              className="focus-console rounded-sm px-2 py-1 text-xs text-console-300 hover:text-console-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={creatingBranch || !branchName.trim()}
              className={`${primaryBtn} w-auto`}
              onClick={() => void createBranch()}
            >
              {creatingBranch ? "Creating…" : "Create branch"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmingDiscard}
        onOpenChange={setConfirmingDiscard}
        title="Delete this branch?"
        description={
          branch?.change_logs.length
            ? "Local edits will be removed and the saved Change Logs will be abandoned. Main remains untouched."
            : "Everything typed on it disappears. Main is untouched either way."
        }
        confirm="Delete"
        onConfirm={async () => {
          await discardBranch();
        }}
      />

      <Dialog open={submitReviewOpen} onOpenChange={setSubmitReviewOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create Change Request</DialogTitle>
            <DialogDescription>
              Review the complete Change Log sequence and its combined effect
              before submission.
            </DialogDescription>
          </DialogHeader>
          <ol className="surface-panel divide-y divide-console-600/60">
            {(branch?.change_logs ?? []).map((log) => (
              <li
                key={log.id}
                className="flex items-start gap-3 px-gutter py-3 text-sm"
              >
                <span className="font-mono text-xs text-console-400">
                  #{log.seq}
                </span>
                <span className="text-console-100">{log.message}</span>
              </li>
            ))}
          </ol>
          <div className="surface-panel p-gutter-lg">
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.02em] text-console-400">
              Combined changes
            </h3>
            {submitDiff === null ? (
              <LoadingState label="Computing redline…" />
            ) : (
              <DiffView spans={submitDiff} />
            )}
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setSubmitReviewOpen(false)}
              className="focus-console rounded-sm px-2 py-1 text-xs text-console-300 hover:text-console-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submittingWorkstream}
              onClick={() => void submitChangeRequest()}
              className={`${primaryBtn} w-auto`}
            >
              {submittingWorkstream ? "Creating…" : "Create Change Request"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reconcileOpen} onOpenChange={setReconcileOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Reconcile Change Logs</DialogTitle>
            <DialogDescription>
              Compare the latest server checkpoint with your local draft, then
              edit and confirm the resolved snapshot that should become your
              next checkpoint.
            </DialogDescription>
          </DialogHeader>
          <section>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.02em] text-console-400">
              Latest checkpoint to local draft
            </h3>
            <div className="surface-panel max-h-56 overflow-auto p-gutter">
              {reconcileDiff === null ? (
                <LoadingState label="Computing redline…" />
              ) : (
                <DiffView spans={reconcileDiff} />
              )}
            </div>
          </section>
          <div className="grid gap-3 md:grid-cols-2">
            <section>
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.02em] text-console-400">
                Latest saved checkpoint
              </h3>
              <div className="surface-panel max-h-72 overflow-auto p-gutter">
                <DocumentViewer
                  markdown={branch?.change_logs.at(-1)?.content_markdown ?? ""}
                  emptyCopy="This checkpoint is empty."
                />
              </div>
            </section>
            <section>
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.02em] text-console-400">
                Resolved draft
              </h3>
              {/* The name carries through the reconciliation unchanged: a
                  branch proposes body changes only, so there is nothing here
                  to resolve about it. */}
              <p className="mb-2 truncate text-sm text-console-200">
                {reconcileTitle}
              </p>
              <textarea
                value={reconcileContent}
                onChange={(event) => setReconcileContent(event.target.value)}
                aria-label="Resolved document content"
                rows={14}
                className="w-full rounded-sm border border-console-600 bg-console-950 px-3 py-2 font-mono text-xs leading-5 text-console-100"
              />
            </section>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setReconcileOpen(false)}
              className="focus-console rounded-sm px-2 py-1 text-xs text-console-300 hover:text-console-100"
            >
              Keep reviewing
            </button>
            <button
              type="button"
              disabled={!reconcileTitle.trim()}
              onClick={() => void reconcileWorkstream()}
              className={`${primaryBtn} w-auto`}
            >
              Confirm resolved draft
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmingCloseReview}
        onOpenChange={setConfirmingCloseReview}
        title="Close this Change Request?"
        description="The review ends without merging and the branch becomes editable again. The Change Request stays on record with the Change Logs it carried."
        confirm="Close it"
        onConfirm={closeReview}
      />

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete document?"
        description="This document will disappear from its project."
        confirm="Delete"
        onConfirm={remove}
      />

      <ImportDialog
        open={importRevisionOpen}
        onOpenChange={setImportRevisionOpen}
        title="Import new version"
        description="The docx is converted to Markdown and proposed as a new version through a Change Request, exactly like a branch."
        submitLabel="Import"
        onSubmit={importRevision}
      />
    </div>
  );
}
