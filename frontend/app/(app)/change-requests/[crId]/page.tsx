"use client";
import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError, changeRequests } from "@/lib/api";
import type {
  ChangeRequestDetail,
  ChangeLog,
  CRComment,
  DiffSpan,
} from "@/lib/types";
import { useAuth } from "@/lib/auth-store";
import { useNavStore } from "@/lib/nav-store";
import { usePermissions } from "@/lib/use-permissions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { anchorStatus, anchorText } from "@/components/diff-view";
import { LineDiff, type DiffRow } from "@/components/line-diff";
import { CrStatusBadge } from "@/components/cr-status-badge";
import { primaryBtn } from "@/components/auth-shell";
import {
  ErrorState,
  LoadingState,
  notFoundCopy,
} from "@/components/page-state";

export default function ChangeRequestPage({
  params,
}: {
  params: Promise<{ crId: string }>;
}) {
  const { crId } = use(params);
  const [cr, setCr] = useState<ChangeRequestDetail | null>(null);
  const [error, setError] = useState("");
  const { setDocumentId, setProjectId } = useNavStore();
  // The CR detail carries both ids denormalized, so the sidebar can highlight
  // the project and document this review belongs to.
  useEffect(() => {
    if (!cr) return;
    setProjectId(cr.project_id);
    setDocumentId(cr.document_id);
    return () => {
      if (useNavStore.getState().projectId === cr.project_id) {
        setProjectId(null);
      }
      if (useNavStore.getState().documentId === cr.document_id) {
        setDocumentId(null);
      }
    };
  }, [cr, setDocumentId, setProjectId]);
  useEffect(() => {
    changeRequests
      .get(crId)
      .then(setCr)
      .catch((e) =>
        setError(
          e instanceof ApiError && (e.status === 404 || e.status === 403)
            ? notFoundCopy
            : "Could not load this Change Request.",
        ),
      );
  }, [crId]);
  if (error) return <ErrorState message={error} />;
  if (!cr) return <LoadingState label="Loading Change Request…" />;
  return <CRView key={cr.id} initial={cr} />;
}

function refreshCr(crId: string): Promise<ChangeRequestDetail> {
  return changeRequests.get(crId);
}

function CRView({ initial }: { initial: ChangeRequestDetail }) {
  const { user } = useAuth();
  const [cr, setCr] = useState(initial);
  const { has, loading } = usePermissions(cr.project_id);
  const canApprove = !loading && has("docs:approve");
  const isAuthor = !!user && user.id === cr.opened_by;
  const canClose = cr.status === "open" && (isAuthor || canApprove);
  // Who may anchor and post: the author and reviewers, matching the server.
  const canDiscuss = cr.status === "open" && (isAuthor || has("docs:review"));

  const [spansBranch, setSpansBranch] = useState<DiffSpan[] | null>(null);
  const [spansMain, setSpansMain] = useState<DiffSpan[] | null>(null);
  const [comments, setComments] = useState<CRComment[] | null>(null);
  const [changeLogs, setChangeLogs] = useState<ChangeLog[] | null>(null);
  const [logDiffs, setLogDiffs] = useState<Record<string, DiffSpan[]>>({});
  const [loadingLogID, setLoadingLogID] = useState<string | null>(null);

  // Merge / resolve state.
  const [resolvedTitle, setResolvedTitle] = useState(initial.title);
  const [resolvedBody, setResolvedBody] = useState(initial.content_markdown);
  const [merging, setMerging] = useState(false);

  // Discussion state.
  const [commentBody, setCommentBody] = useState("");
  // The passage the reviewer highlighted, resolved to the span range it
  // covers. Null means the comment will be a general one.
  const [anchor, setAnchor] = useState<{
    start: number;
    end: number;
    quote: string;
  } | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [wholeDocumentOpen, setWholeDocumentOpen] = useState(false);
  const [postingComment, setPostingComment] = useState(false);

  // Close state.
  const [confirmingClose, setConfirmingClose] = useState(false);

  useEffect(() => {
    changeRequests
      .diff(initial.id, "branch")
      .then(setSpansBranch)
      .catch(() => toast.error("Could not load the proposed changes."));
    if (!initial.head_matches_base) {
      changeRequests
        .diff(initial.id, "main")
        .then(setSpansMain)
        .catch(() => {});
    }
    changeRequests.comments
      .list(initial.id)
      .then(setComments)
      .catch(() => {});
    if (initial.workstream_id) {
      changeRequests.changeLogs
        .list(initial.id)
        .then(setChangeLogs)
        .catch(() => toast.error("Could not load the Change Log timeline."));
    }
  }, [initial.id, initial.head_matches_base, initial.workstream_id]);

  async function toggleLogDiff(log: ChangeLog) {
    if (logDiffs[log.id]) {
      setLogDiffs((current) => {
        const next = { ...current };
        delete next[log.id];
        return next;
      });
      return;
    }
    setLoadingLogID(log.id);
    try {
      const spans = await changeRequests.changeLogs.diff(cr.id, log.id);
      setLogDiffs((current) => ({ ...current, [log.id]: spans }));
    } catch {
      toast.error("Could not load that Change Log diff.");
    } finally {
      setLoadingLogID(null);
    }
  }

  async function reload() {
    try {
      const fresh = await refreshCr(initial.id);
      setCr(fresh);
      if (fresh.status === "merged") {
        changeRequests
          .diff(fresh.id, "main")
          .then(setSpansMain)
          .catch(() => {});
      }
    } catch {
      /* keep showing what we had */
    }
  }

  async function mergeClean() {
    setMerging(true);
    try {
      await changeRequests.merge(initial.id);
      toast.success("Merged into main.");
      await reload();
    } catch {
      toast.error("Merge failed. Main may have moved; a resolution is needed.");
    } finally {
      setMerging(false);
    }
  }

  async function mergeResolution() {
    setMerging(true);
    try {
      await changeRequests.merge(initial.id, {
        resolved_title: resolvedTitle.trim() || initial.title,
        resolved_content_markdown: resolvedBody,
      });
      toast.success("Resolution merged into main.");
      await reload();
    } catch {
      toast.error("Could not merge the resolution.");
    } finally {
      setMerging(false);
    }
  }

  async function close() {
    try {
      await changeRequests.close(initial.id, "");
      toast.success(
        cr.workstream_id
          ? "Change Request closed. The branch is editable again."
          : "Change Request closed.",
      );
      setConfirmingClose(false);
      await reload();
    } catch {
      toast.error("Could not close the Change Request.");
    }
  }

  async function postComment() {
    if (!commentBody.trim() || !anchor) return;
    setPostingComment(true);
    try {
      const created = await changeRequests.comments.add(
        initial.id,
        commentBody.trim(),
        anchor ? { op_index: anchor.start, op_end_index: anchor.end } : undefined,
      );
      setComments((prev) => [...(prev ?? []), created]);
      setCommentBody("");
      setAnchor(null);
    } catch {
      toast.error("Could not post the comment.");
    } finally {
      setPostingComment(false);
    }
  }

  // A line is anchored by the span range it covers, which is what the server
  // can verify against its own redline. The line's text rides along only so
  // the composer can quote what is being discussed.
  function commentOnLine(row: DiffRow) {
    openComposer({
      start: row.spanStart,
      end: row.spanEnd,
      quote: row.text.trim() || "(blank line)",
    });
  }

  function openComposer(next: { start: number; end: number; quote: string }) {
    setAnchor(next);
    composerRef.current?.focus();
    composerRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  async function deleteComment(id: string) {
    try {
      await changeRequests.comments.remove(initial.id, id);
      setComments((prev) => (prev ?? []).filter((c) => c.id !== id));
    } catch {
      toast.error("Could not remove that comment.");
    }
  }

  const conflict = cr.status === "open" && !cr.head_matches_base;

  return (
    <div className="space-y-4">
      {/* --- Header --- */}
      <div className="flex items-center gap-3">
        <Link
          href={`/documents/${cr.document_id}`}
          aria-label="Back to document"
          className="focus-console flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-console-400 hover:text-console-100"
        >
          <span aria-hidden>&larr;</span>
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{cr.title}</h1>
        <CrStatusBadge status={cr.status} />
        {cr.kind === "import" && (
          <span className="rounded-[4px] border border-console-600 px-1.5 py-0.5 font-mono text-[11px] text-console-300">
            docx import
          </span>
        )}
      </div>
      <p className="text-xs text-console-400">
        Opened {cr.created_at.slice(0, 16).replace("T", " ")}
        {cr.merged_by ? ` · merged by ${shortId(cr.merged_by)}` : ""}
        {cr.closed_at
          ? ` · closed ${cr.closed_at.slice(0, 16).replace("T", " ")}`
          : ""}
        {isAuthor ? " · you opened this" : ""}
      </p>
      {/* --- Changes --- */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-xs font-medium tracking-widest text-console-400 uppercase">
            Proposed changes (base &rarr; branch)
          </h2>
          <button
            type="button"
            disabled={spansBranch === null}
            onClick={() => setWholeDocumentOpen(true)}
            className="focus-console rounded-sm border border-console-600 px-2 py-1 text-xs font-semibold whitespace-nowrap text-console-100 hover:border-console-400 disabled:opacity-40"
          >
            Show entire document
          </button>
        </div>
        <div className="surface-panel overflow-hidden p-0">
          {spansBranch === null ? (
            <div className="p-gutter-lg">
              <LoadingState label="Computing redline…" />
            </div>
          ) : (
            <LineDiff
              spans={spansBranch}
              emptyCopy="This proposal changes nothing relative to its base."
              highlight={anchor}
              onCommentLine={canDiscuss ? commentOnLine : undefined}
              onCommentRange={canDiscuss ? openComposer : undefined}
            />
          )}
        </div>
      </section>

      {changeLogs && changeLogs.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-widest text-console-400">
            Change Log timeline
          </h2>
          <ol className="surface-panel divide-y divide-console-600/60">
            {changeLogs.map((log) => (
              <li key={log.id} className="px-gutter py-3">
                <button
                  type="button"
                  onClick={() => void toggleLogDiff(log)}
                  aria-expanded={!!logDiffs[log.id]}
                  className="focus-console flex w-full items-start gap-3 text-left"
                >
                  <span className="font-mono text-xs text-console-400">#{log.seq}</span>
                  <span className="min-w-0 flex-1 text-sm text-console-100">{log.message}</span>
                  <span className="shrink-0 text-xs text-console-400">
                    {loadingLogID === log.id
                      ? "Loading…"
                      : logDiffs[log.id]
                        ? "Hide changes"
                        : "View changes"}
                  </span>
                </button>
                <p className="ml-8 mt-1 font-mono text-xs text-console-400">
                  {shortId(log.created_by)} · {log.created_at.slice(0, 16).replace("T", " ")}
                </p>
                {logDiffs[log.id] && (
                  <div className="mt-3 border-t border-console-600/60 pt-3">
                    <LineDiff spans={logDiffs[log.id]} emptyCopy="No body changes in this checkpoint." />
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {(conflict || cr.status === "merged") && spansMain !== null && spansMain.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-medium tracking-widest text-console-400 uppercase">
            Meanwhile on main (base &rarr; main)
          </h2>
          <div className="surface-panel p-gutter-lg">
            <LineDiff spans={spansMain} />
          </div>
        </section>
      )}

      {/* --- Discussion --- */}
      <section>
        <h2 className="mb-2 text-xs font-medium tracking-widest text-console-400 uppercase">
          Discussion
        </h2>
        <ul className="surface-panel divide-y divide-console-600/60">
          {(comments ?? []).map((c) => (
            <li key={c.id} className="px-gutter py-3">
              <div className="mb-1 flex items-center gap-2 text-xs text-console-400">
                <span className="font-mono">{shortId(c.created_by)}</span>
                <span>{c.created_at.slice(0, 16).replace("T", " ")}</span>
                <AnchorLabel spans={spansBranch ?? []} comment={c} />
                {(user?.id === c.created_by || has("docs:manage_comments")) && (
                  <button
                    onClick={() => void deleteComment(c.id)}
                    className="ml-auto focus-console rounded-sm px-1 text-console-400 underline-offset-4 hover:text-signal-error hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap text-console-100">{c.body}</p>
            </li>
          ))}
          {comments !== null && comments.length === 0 && (
            <li className="px-gutter py-3 text-sm text-console-300">No comments yet.</li>
          )}
        </ul>

        {/* No composer until a line is chosen: every comment references a
            passage, so there is nothing to write into before one is picked. */}
        {canDiscuss && anchor && (
          <div className="surface-panel mt-3 p-gutter">
            {(
              <div className="mb-2 flex items-start gap-2 text-xs text-console-300">
                <span className="min-w-0 flex-1">
                  Commenting on{" "}
                  <q className="font-mono text-console-100">
                    {anchor.quote.length > 120
                      ? `${anchor.quote.slice(0, 117)}…`
                      : anchor.quote}
                  </q>
                </span>
                <button
                  onClick={() => setAnchor(null)}
                  className="focus-console shrink-0 rounded-sm px-1 underline-offset-4 hover:underline"
                >
                  clear
                </button>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void postComment();
              }}
            >
              <textarea
                ref={composerRef}
                rows={3}
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="What about this passage?"
                className="w-full rounded-sm border border-console-600 bg-console-950 px-3 py-2 text-sm text-console-100"
              />
              <div className="mt-2 text-right">
                <button type="submit" disabled={postingComment} className={`${primaryBtn} w-auto`}>
                  {postingComment ? "Posting…" : "Comment"}
                </button>
              </div>
            </form>
          </div>
        )}
        {spansBranch !== null && spansBranch.length > 0 && canDiscuss && !anchor && (
          <p className="mt-1 text-xs text-console-400">
            Hover a line in Proposed changes and use its comment icon to start a
            comment on that line.
          </p>
        )}
      </section>

      {/* --- Merge panel --- */}
      {cr.status === "open" && canApprove && !loading && (
        <section className="surface-panel p-gutter-lg">
          {!conflict ? (
            <>
              <h2 className="text-sm font-semibold">Review</h2>
              <p className="mt-1 mb-3 text-xs text-console-300">
                Main still sits exactly where this proposal started, so it
                merges exactly as proposed.
              </p>
              <button disabled={merging} onClick={() => void mergeClean()} className={`${primaryBtn} w-auto`}>
                {merging ? "Merging…" : "Merge into main"}
              </button>
            </>
          ) : (
            <>
              <h2 className="text-sm font-semibold">Resolve conflict</h2>
              <p className="mt-1 mb-3 text-xs text-console-300">
                Compose the result yourself from both sides. There is no
                automatic merge by design: Markdown integrity beats convenience.
                The editor starts from the proposal.
              </p>
              <label className="block text-xs text-console-300" htmlFor="resolve-title">
                Title
              </label>
              <input
                id="resolve-title"
                value={resolvedTitle}
                onChange={(e) => setResolvedTitle(e.target.value)}
                className="mb-3 mt-1 w-full rounded-sm border border-console-600 bg-console-950 px-3 py-2 text-sm text-console-100"
              />
              <textarea
                value={resolvedBody}
                onChange={(e) => setResolvedBody(e.target.value)}
                rows={16}
                spellCheck={false}
                aria-label="Resolved content"
                className="w-full rounded-sm border border-console-600 bg-console-950 px-3 py-2 font-mono text-xs leading-5 text-console-100"
              />
              <button
                disabled={merging}
                onClick={() => void mergeResolution()}
                className={`${primaryBtn} mt-3 w-auto`}
              >
                {merging ? "Merging…" : "Merge resolution"}
              </button>
            </>
          )}
        </section>
      )}

      {cr.status === "open" && !canApprove && !loading && (
        <p className="text-xs text-console-400">
          Awaiting review. Merging needs the docs:approve permission.
        </p>
      )}

      {/* --- Close controls --- */}
      {canClose && (
        <section className="surface-panel flex items-center justify-between gap-3 p-gutter">
          <p className="text-xs text-console-300">
            {isAuthor && !canApprove
              ? "Withdraw this proposal without merging. Its branch becomes editable again."
              : "End this review without merging. The branch becomes editable again."}
          </p>
          <button
            onClick={() => setConfirmingClose(true)}
            className="focus-console shrink-0 rounded-sm border border-console-600 px-2 py-1 text-xs font-semibold text-console-100 hover:border-signal-error hover:text-signal-error"
          >
            Close
          </button>
        </section>
      )}

      {/* The full read, kept out of the page so the review itself stays a
          list of changes. Commenting stays on the page: an anchor made from
          inside a modal would point at a line the reviewer can no longer see
          once it closes. */}
      <Dialog open={wholeDocumentOpen} onOpenChange={setWholeDocumentOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Entire document</DialogTitle>
            <DialogDescription>
              Every line of this proposal, with its changes marked in place.
            </DialogDescription>
          </DialogHeader>
          <div className="surface-panel overflow-hidden p-0">
            <LineDiff
              spans={spansBranch ?? []}
              emptyCopy="This proposal changes nothing relative to its base."
              showAll
            />
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmingClose}
        onOpenChange={setConfirmingClose}
        title="Close without merging?"
        description="The proposal stays on record with its Change Logs, and its branch becomes editable again."
        confirm="Close request"
        onConfirm={close}
      />
    </div>
  );
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function AnchorLabel({
  spans,
  comment,
}: {
  spans: DiffSpan[];
  comment: CRComment;
}) {
  const status = anchorStatus(spans, comment.diff_anchor);
  if (status === "none") return null;
  if (status === "gone") {
    return <span className="text-console-400">(anchored passage changed)</span>;
  }
  const passage = anchorText(spans, comment.diff_anchor);
  const quote = passage.length > 80 ? `${passage.slice(0, 77)}…` : passage;
  return (
    <span className="max-w-48 truncate font-mono text-console-400">
      on “{quote}”
    </span>
  );
}
