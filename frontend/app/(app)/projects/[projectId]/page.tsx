"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FileText, Trash2, Upload, Plus } from "lucide-react";
import { toast } from "sonner";
import { documents as documentsApi, projects as projectsApi, ApiError } from "@/lib/api";
import { useProjectPermissions } from "@/lib/use-project-permissions";
import { ProjectPermissionsPanel } from "@/components/ProjectPermissionsPanel";
import { ImportDialog } from "@/components/ImportDialog";
import { StatusBadge } from "@/components/status-badge";
import { shortId } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Document, RevisionStatus } from "@/lib/types";

function DocumentStatusBadge({ documentId }: { documentId: string }) {
  // Documents don't carry a status of their own — only revisions do — so we
  // show the status of the latest revision in the history for a quick signal
  // on the project's document list.
  const [status, setStatus] = useState<RevisionStatus | null>(null);
  useEffect(() => {
    documentsApi
      .history(documentId)
      .then((revs) => setStatus(revs[0]?.status ?? null))
      .catch(() => {});
  }, [documentId]);
  if (!status) return <span className="text-xs text-console-500">Empty</span>;
  return <StatusBadge status={status} />;
}

function NewDocumentDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (documentId: string) => void;
}) {
  const { projectId } = useParams<{ projectId: string }>();
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const doc = await documentsApi.create(projectId, title);
      onOpenChange(false);
      onCreated(doc.id);
    } catch (err) {
      toast.error("Couldn't create document", { description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border border-console-600 bg-console-800 text-console-50 shadow-panel">
        <DialogHeader>
          <DialogTitle className="font-heading">New document</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <input
            autoFocus
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Document title"
            className="rounded-md border border-console-500 bg-console-900 px-3 py-2 text-sm focus-console transition-shadow"
          />
          <button
            type="submit"
            disabled={submitting}
            className="hover-lift press-scale rounded-md border border-signal-info/50 bg-signal-info/10 px-3 py-2 text-sm text-signal-info hover:bg-signal-info/20 transition-colors disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create document"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const { has, loading: permsLoading } = useProjectPermissions(projectId);

  const [project, setProject] = useState<Awaited<ReturnType<typeof projectsApi.get>> | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, d] = await Promise.all([projectsApi.get(projectId), documentsApi.list(projectId)]);
      setProject(p);
      setDocs(d);
    } catch (err) {
      toast.error("Couldn't load project", { description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  async function deleteProject() {
    setDeleting(true);
    try {
      await projectsApi.remove(projectId);
      router.push("/dashboard");
    } catch (err) {
      toast.error("Couldn't delete project", { description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <p className="text-sm text-console-400">Loading…</p>;
  if (!project) return null;

  const isOrgProject = !!project.organization_id;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-console-400">
              {isOrgProject ? "Team project" : "Personal project"} · <span className="font-mono">{shortId(project.id)}</span>
            </div>
            <h1 className="font-heading text-xl font-semibold">{project.name}</h1>
          </div>
          <div className="flex gap-2">
            {has("docs:import") && (
              <button
                onClick={() => setImportOpen(true)}
                className="hover-lift press-scale flex items-center gap-1.5 rounded-md border border-console-500 px-3 py-1.5 text-sm text-console-200 hover:border-signal-info hover:text-signal-info transition-colors"
              >
                <Upload className="h-3.5 w-3.5" />
                Import
              </button>
            )}
            {has("docs:edit") && (
              <button
                onClick={() => setNewDocOpen(true)}
                className="hover-lift press-scale flex items-center gap-1.5 rounded-md border border-signal-info/50 bg-signal-info/10 px-3 py-1.5 text-sm text-signal-info hover:bg-signal-info/20 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                New document
              </button>
            )}
          </div>
        </div>

        <h2 className="mb-2 text-sm font-semibold text-console-400">Documents</h2>
        {docs.length === 0 ? (
          <div className="surface-panel bg-grid flex flex-col items-center gap-2 p-gutter-lg text-center">
            <FileText className="h-6 w-6 text-console-400" />
            <p className="text-sm text-console-300">No documents yet — import one or start from scratch.</p>
          </div>
        ) : (
          <div className="surface-panel divide-y divide-console-600/80">
            {docs.map((d, i) => (
              <Link
                key={d.id}
                href={`/documents/${d.id}`}
                style={{ animationDelay: `${i * 40}ms` }}
                className="animate-stagger-in group flex items-center justify-between gap-3 px-gutter py-row-sm row-hover"
              >
                <span className="flex items-center gap-2 truncate text-sm">
                  <FileText className="h-4 w-4 shrink-0 text-console-400" />
                  {d.title}
                </span>
                <div className="flex items-center gap-3">
                  <DocumentStatusBadge documentId={d.id} />
                  <span className="text-console-500 transition-transform group-hover:translate-x-0.5 group-hover:text-signal-info">
                    →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {!permsLoading && has("docs:manage") && isOrgProject && project.organization_id && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-console-400">Permissions</h2>
          <p className="mb-3 text-xs text-console-500">Organization admins can already do everything below.</p>
          <div className="surface-panel p-gutter">
            <ProjectPermissionsPanel projectId={projectId} organizationId={project.organization_id} />
          </div>
        </div>
      )}

      {!permsLoading && has("docs:manage") && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-signal-error">Danger zone</h2>
          <div className="rounded-md border border-signal-error/40 bg-signal-error/5 p-gutter-lg">
            <p className="mb-3 text-sm text-console-300">
              Deleting a project permanently removes all its documents and revision history. This can't be undone.
            </p>
            <button
              onClick={() => setDeleteOpen(true)}
              className="press-scale flex items-center gap-1.5 rounded-md border border-signal-error/50 px-3 py-1.5 text-sm text-signal-error hover:bg-signal-error/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete project
            </button>
          </div>
        </div>
      )}

      <ImportDialog
        projectId={projectId}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(docId) => router.push(`/documents/${docId}`)}
      />
      <NewDocumentDialog
        open={newDocOpen}
        onOpenChange={setNewDocOpen}
        onCreated={(docId) => router.push(`/documents/${docId}`)}
      />
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm border border-console-600 bg-console-800 text-console-50 shadow-panel">
          <DialogHeader>
            <DialogTitle className="font-heading text-signal-error">Delete this project?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-console-300">This can't be undone.</p>
          <button
            onClick={deleteProject}
            disabled={deleting}
            className="rounded-md border border-signal-error/50 bg-signal-error/10 px-3 py-2 text-sm text-signal-error hover:bg-signal-error/20 transition-all disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete permanently"}
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
