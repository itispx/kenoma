"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { documents } from "@/lib/api";
import type { DocSummary } from "@/lib/types";
import { usePermissions } from "@/lib/use-permissions";
import { primaryBtn } from "@/components/auth-shell";
import { ImportDialog } from "@/components/import-dialog";
import { cn } from "@/lib/utils";
import { ErrorState, LoadingState } from "@/components/page-state";
export default function ProjectDocumentsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params),
    router = useRouter();
  const [docs, setDocs] = useState<DocSummary[] | null>(null);
  const [deletedDocs, setDeletedDocs] = useState<DocSummary[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const { has, loading } = usePermissions(projectId);
  const canManage = !loading && has("docs:manage");
  useEffect(() => {
    documents
      .listForProject(projectId)
      .then(setDocs)
      .catch(() => setError("Could not load documents."));
  }, [projectId]);
  // The deleted list names rows the rest of the project no longer sees, so it
  // loads only for managers, under the same permission that removes and
  // restores documents.
  useEffect(() => {
    if (!canManage) return;
    documents
      .listDeletedForProject(projectId)
      .then(setDeletedDocs)
      .catch(() => setDeletedDocs([]));
  }, [canManage, projectId]);
  async function restoreDoc(id: string) {
    setRestoring(id);
    try {
      await documents.restore(id);
      setDeletedDocs((prev) => (prev ? prev.filter((d) => d.id !== id) : prev));
      // The restored document re-enters the live list, so refresh it too.
      documents.listForProject(projectId).then(setDocs).catch(() => {});
    } catch {
      toast.error("Could not restore this document.");
    } finally {
      setRestoring(null);
    }
  }
  async function create() {
    setCreating(true);
    try {
      const doc = await documents.create(projectId, "Untitled document");
      router.push(`/documents/${doc.id}`);
    } catch {
      toast.error("Could not create a document.");
      setCreating(false);
    }
  }
  async function importDoc(file: File) {
    const doc = await documents.importNew(projectId, file);
    toast.success("Document imported.");
    router.push(`/documents/${doc.id}`);
  }
  return (
    <div>
      {/* The tab bar above already says where we are, so this row carries a
          count instead of repeating the word "Documents". */}
      <div className="mb-4 flex h-9 items-center justify-between gap-4">
        <span className="text-xs tracking-widest text-console-400 uppercase">
          {docs
            ? `${docs.length} ${docs.length === 1 ? "document" : "documents"}`
            : ""}
        </span>
        <div className="flex items-center gap-3">
          {!loading && has("docs:import") && (
            <button
              onClick={() => setImportOpen(true)}
              className="focus-console rounded-sm px-1 text-xs text-console-300 underline-offset-4 hover:text-console-100 hover:underline"
            >
              Import docx
            </button>
          )}
          {!loading && has("docs:edit") && (
            <button
              onClick={create}
              disabled={creating}
              className={cn(primaryBtn, "w-auto")}
            >
              {creating ? "Creating…" : "New document"}
            </button>
          )}
        </div>
      </div>
      {error ? (
        <ErrorState message={error} />
      ) : !docs ? (
        <LoadingState label="Loading documents…" />
      ) : docs.length === 0 ? (
        <div className="surface-panel p-gutter-lg">
          <p className="text-sm text-console-200">No documents yet.</p>
          <p className="mt-1 text-xs text-console-400">
            {has("docs:edit")
              ? "Start one and save its first version."
              : "Someone with edit access can start the first one."}
          </p>
        </div>
      ) : (
        <ul className="surface-panel divide-y divide-console-600/60">
          {docs.map((d) => (
            <li key={d.id}>
              <Link
                href={`/documents/${d.id}`}
                className="row-hover focus-console flex items-baseline justify-between gap-4 px-gutter py-3"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm text-console-50">{d.title}</span>
                  {!d.head_revision_id && (
                    <span className="shrink-0 rounded-[4px] border border-signal-warning/50 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-signal-warning">
                      Initial draft
                    </span>
                  )}
                </span>
                <span className="font-mono text-xs text-console-400">
                  {d.updated_at.slice(0, 16).replace("T", " ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {canManage && deletedDocs && deletedDocs.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <span className="text-xs tracking-widest text-console-400 uppercase">
              Recently deleted
            </span>
            <span className="text-xs text-console-400">
              {deletedDocs.length}{" "}
              {deletedDocs.length === 1 ? "document" : "documents"}
            </span>
          </div>
          {/* Lighter than the live list on purpose: these rows are not work
              someone is heading into, they are a recovery surface. */}
          <ul className="surface-panel divide-y divide-console-600/60">
            {deletedDocs.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-4 px-gutter py-3"
              >
                <div className="flex min-w-0 items-baseline gap-3">
                  <span className="truncate text-sm text-console-300">
                    {d.title}
                  </span>
                  {d.deleted_at && (
                    <span className="shrink-0 font-mono text-xs text-console-400">
                      {d.deleted_at.slice(0, 16).replace("T", " ")}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void restoreDoc(d.id)}
                  disabled={restoring === d.id}
                  className="focus-console shrink-0 rounded-sm border border-console-500 px-2 py-1 text-xs text-console-200 transition-colors duration-150 hover:border-signal-info hover:text-signal-info disabled:pointer-events-none disabled:opacity-50"
                >
                  {restoring === d.id ? "Restoring…" : "Restore"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import document"
        description="The docx is converted to Markdown and becomes revision 1 of a new document."
        submitLabel="Import"
        onSubmit={importDoc}
      />
    </div>
  );
}
