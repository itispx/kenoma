"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, MessageSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { documents as documentsApi, revisions as revisionsApi, ApiError } from "@/lib/api";
import { useProjectPermissions } from "@/lib/use-project-permissions";
import { DiffView } from "@/components/DiffView";
import { StatusBadge } from "@/components/status-badge";
import type { Comment, DiffOp, Document, RevisionStatus } from "@/lib/types";

export default function ReviewPage() {
  const { documentId, revisionId } = useParams<{ documentId: string; revisionId: string }>();
  const router = useRouter();

  const [document, setDocument] = useState<Document | null>(null);
  const [status, setStatus] = useState<RevisionStatus | null>(null);
  const [ops, setOps] = useState<DiffOp[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);

  const { has, loading: permsLoading } = useProjectPermissions(document?.project_id);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [doc, rev, diffRes, commentList] = await Promise.all([
        documentsApi.get(documentId),
        revisionsApi.get(revisionId),
        revisionsApi.diff(revisionId),
        revisionsApi.listComments(revisionId),
      ]);
      setDocument(doc);
      setStatus(rev.status);
      setOps(diffRes.diff.ops);
      setComments(commentList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load review.");
    } finally {
      setLoading(false);
    }
  }, [documentId, revisionId]);

  useEffect(() => {
    load();
  }, [load]);

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (selectedIndex === null) return;
    setPosting(true);
    try {
      await revisionsApi.createComment(revisionId, selectedIndex, commentBody);
      setCommentBody("");
      setSelectedIndex(null);
      const commentList = await revisionsApi.listComments(revisionId);
      setComments(commentList);
    } catch (err) {
      toast.error("Couldn't add comment", { description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setPosting(false);
    }
  }

  async function act(action: "approve" | "reject" | "request-changes") {
    setActioning(action);
    try {
      if (action === "approve") await revisionsApi.approve(revisionId);
      else if (action === "reject") await revisionsApi.reject(revisionId);
      else await revisionsApi.requestChanges(revisionId);
      router.push(`/documents/${documentId}`);
    } catch (err) {
      toast.error("That didn't work", { description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setActioning(null);
    }
  }

  async function resolveComment(commentId: string) {
    await revisionsApi.resolveComment(commentId).catch(() => {});
    setComments(await revisionsApi.listComments(revisionId));
  }

  async function deleteComment(commentId: string) {
    if (!confirm("Delete this comment?")) return;
    await revisionsApi.deleteComment(commentId).catch(() => {});
    setComments(await revisionsApi.listComments(revisionId));
  }

  if (loading) return <p className="text-sm text-console-400">Loading…</p>;
  if (error && !document) return <p className="text-sm text-signal-error">{error}</p>;
  if (!document) return null;

  const canReview = !permsLoading && has("docs:review");
  const canApprove = !permsLoading && has("docs:approve");
  const canManageComments = !permsLoading && has("docs:manage_comments");
  const isInReview = status === "in_review";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-console-400">Review</div>
          <h1 className="flex items-center gap-2 font-heading text-xl font-semibold">
            {document.title}
            {status && <StatusBadge status={status} />}
          </h1>
        </div>
        <Link
          href={`/documents/${documentId}`}
          className="flex items-center gap-1.5 text-xs text-console-400 hover:text-signal-info transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to document
        </Link>
      </div>

      {!isInReview && (
        <p className="rounded-md border border-console-600 bg-console-800 p-gutter text-sm text-console-300">
          This revision is no longer under active review — showing it read-only.
        </p>
      )}

      {error && <p className="text-sm text-signal-error">{error}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold text-console-400">What changed since the last approved version</h2>
          <DiffView
            ops={ops}
            selectedIndex={selectedIndex}
            onSelect={isInReview && canReview ? setSelectedIndex : undefined}
          />

          {isInReview && (canApprove || canReview) && (
            <div className="mt-6 flex gap-2 border-t border-console-600 pt-4">
              {canApprove && (
                <button
                  onClick={() => act("approve")}
                  disabled={actioning !== null}
                  className="hover-lift press-scale rounded-md border border-signal-success/50 bg-signal-success/10 px-3 py-2 text-sm text-signal-success hover:bg-signal-success/20 transition-colors disabled:opacity-50"
                >
                  Approve
                </button>
              )}
              {canApprove && (
                <button
                  onClick={() => act("reject")}
                  disabled={actioning !== null}
                  className="press-scale rounded-md border border-signal-error/50 bg-signal-error/10 px-3 py-2 text-sm text-signal-error hover:bg-signal-error/20 transition-colors disabled:opacity-50"
                >
                  Reject
                </button>
              )}
              {canReview && (
                <button
                  onClick={() => act("request-changes")}
                  disabled={actioning !== null}
                  className="press-scale rounded-md border border-console-500 px-3 py-2 text-sm text-console-200 hover:border-signal-warning hover:text-signal-warning transition-colors disabled:opacity-50"
                >
                  Request changes
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {isInReview && canReview && selectedIndex !== null && (
            <form onSubmit={postComment} className="animate-stagger-in rounded-md border border-signal-info/40 bg-signal-info/5 p-gutter">
              <p className="mb-2 text-xs text-console-400">
                Commenting on: <span className="italic text-console-300">&quot;{ops[selectedIndex]?.text.slice(0, 80)}&quot;</span>
              </p>
              <textarea
                required
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-console-500 bg-console-900 p-2 text-sm focus-console transition-shadow"
                placeholder="Leave a comment on this change…"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="submit"
                  disabled={posting}
                  className="hover-lift press-scale rounded-md border border-signal-info/50 bg-signal-info/10 px-3 py-1.5 text-sm text-signal-info hover:bg-signal-info/20 transition-colors disabled:opacity-50"
                >
                  {posting ? "Posting…" : "Comment"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIndex(null)}
                  className="rounded-md px-3 py-1.5 text-sm text-console-400 hover:text-console-100 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div>
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-console-400">
              <MessageSquare className="h-3.5 w-3.5" />
              Comments
            </h2>
            {comments.length === 0 ? (
              <p className="text-sm text-console-500">No comments yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {comments.map((c, i) => (
                  <li
                    key={c.id}
                    style={{ animationDelay: `${i * 40}ms` }}
                    className={`animate-stagger-in rounded-md border p-3 text-sm ${
                      c.resolved
                        ? "border-console-700 bg-console-800/50 opacity-60"
                        : "border-console-600 bg-console-800"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between text-xs text-console-400">
                      <span>{c.author_name}</span>
                      <div className="flex gap-2">
                        {!c.resolved && canManageComments && (
                          <button
                            onClick={() => resolveComment(c.id)}
                            title="Resolve"
                            className="hover:text-signal-success transition-colors"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteComment(c.id)}
                          title="Delete"
                          className="hover:text-signal-error transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-console-100">{c.body}</p>
                    {c.resolved && (
                      <p className="mt-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-signal-success">
                        <Check className="h-2.5 w-2.5" /> resolved
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
