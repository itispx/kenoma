"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { History, Download, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { documents as documentsApi, exportApi, ApiError } from "@/lib/api";
import { useProjectPermissions } from "@/lib/use-project-permissions";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { StatusBadge } from "@/components/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Document, Revision } from "@/lib/types";

const AUTOSAVE_DEBOUNCE_MS = 1000;

export default function DocumentPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const router = useRouter();

  const [document, setDocument] = useState<Document | null>(null);
  const [draft, setDraft] = useState<Revision | null>(null);
  const [noDraft, setNoDraft] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  const { has, loading: permsLoading } = useProjectPermissions(document?.project_id);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNoDraft(false);
    try {
      const doc = await documentsApi.get(documentId);
      setDocument(doc);
      try {
        setDraft(await documentsApi.getDraft(documentId));
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setNoDraft(true);
        } else {
          throw err;
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load document.");
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    load();
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [load]);

  function onEditorChange(markdown: string) {
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await documentsApi.autosave(documentId, markdown);
        setSaveState("saved");
      } catch {
        setSaveState("idle");
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  async function startEditing() {
    const rev = await documentsApi.createDraft(documentId);
    setDraft(rev);
    setNoDraft(false);
  }

  async function submit() {
    if (!draft) return;
    setSubmitting(true);
    try {
      const submitted = await documentsApi.submit(documentId);
      router.push(`/documents/${documentId}/review/${submitted.id}`);
    } catch (err) {
      toast.error("Couldn't submit for review", { description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setSubmitting(false);
    }
  }

  async function runExport(kind: "docx" | "pdf") {
    if (!document?.current_published_revision_id) return;
    setExporting(kind);
    try {
      if (kind === "docx") await exportApi.docx(document.current_published_revision_id);
      else await exportApi.pdf(document.current_published_revision_id);
    } catch (err) {
      toast.error("Export failed", { description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setExporting(null);
    }
  }

  if (loading) return <p className="text-sm text-console-400">Loading…</p>;
  if (error) return <p className="text-sm text-signal-error">{error}</p>;
  if (!document) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-console-400">Document</div>
          <h1 className="flex items-center gap-2 font-heading text-xl font-semibold">
            {document.title}
            {draft && <StatusBadge status={draft.status} />}
          </h1>
        </div>
        <Link
          href={`/documents/${documentId}/history`}
          className="flex items-center gap-1.5 text-xs text-console-400 hover:text-signal-info transition-colors"
        >
          <History className="h-3.5 w-3.5" />
          History
        </Link>
      </div>

      {noDraft && (
        <div className="surface-panel bg-grid p-gutter-lg text-center">
          <p className="mb-3 text-sm text-console-300">
            There&apos;s no draft in progress for this document right now.
          </p>
          {has("docs:edit") && (
            <button
              onClick={startEditing}
              className="hover-lift press-scale rounded-md border border-signal-info/50 bg-signal-info/10 px-3 py-2 text-sm text-signal-info hover:bg-signal-info/20 transition-colors"
            >
              Start editing
            </button>
          )}
        </div>
      )}

      {draft && draft.status === "in_review" && (
        <div className="rounded-sm border border-signal-warning/40 bg-signal-warning/5 p-gutter text-sm text-signal-warning">
          This revision is currently under review.{" "}
          <Link href={`/documents/${documentId}/review/${draft.id}`} className="underline underline-offset-2">
            Open the review view
          </Link>
          .
        </div>
      )}

      {draft && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs text-console-400">
              {draft.status === "draft" && !permsLoading && has("docs:edit") && saveState !== "idle" && (
                <>
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      saveState === "saving" ? "bg-signal-warning animate-pulse-glow" : "bg-signal-success"
                    }`}
                  />
                  {saveState === "saving" ? "Saving…" : "Saved"}
                </>
              )}
            </span>
            {draft.status === "draft" && has("docs:submit_review") && (
              <button
                onClick={submit}
                disabled={submitting}
                className="hover-lift press-scale rounded-md border border-signal-info/50 bg-signal-info/10 px-3 py-1.5 text-sm text-signal-info hover:bg-signal-info/20 transition-colors disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit for review"}
              </button>
            )}
          </div>
          <MarkdownEditor
            content={draft.content}
            editable={draft.status === "draft" && has("docs:edit")}
            onChange={draft.status === "draft" ? onEditorChange : undefined}
          />
        </div>
      )}

      {document.current_published_revision_id && has("docs:export") && (
        <div className="surface-panel p-gutter-lg">
          <h2 className="mb-3 text-sm font-semibold">Export the published version</h2>
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={exporting !== null}
                className="hover-lift flex items-center gap-1.5 rounded-md border border-console-500 px-3 py-1.5 text-sm text-console-200 hover:border-signal-info hover:text-signal-info transition-colors disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                {exporting ? "Exporting…" : "Export"}
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="border-console-600 bg-console-800 text-console-50">
                <DropdownMenuItem onClick={() => runExport("docx")}>Word document (.docx)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => runExport("pdf")}>PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}
    </div>
  );
}
