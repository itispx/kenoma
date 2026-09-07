"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Folder, Plus } from "lucide-react";
import { toast } from "sonner";
import { projects } from "@/lib/api";
import type { Project } from "@/lib/types";
import { useOrg } from "@/components/org-context";
import { ErrorState, LoadingState, PageHeading } from "@/components/page-state";
export default function ProjectsPage() {
  const org = useOrg();
  const [items, setItems] = useState<Project[] | null>(null);
  const [deleted, setDeleted] = useState<Project[] | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState("");
  const isAdmin = org.role === "admin";
  useEffect(() => {
    projects
      .listForOrg(org.id)
      .then(setItems)
      .catch(() => setError("Could not load projects."));
  }, [org.id]);
  // The deleted list names projects the rest of the org no longer sees, so it
  // loads only for admins, under the same role that removes and restores them.
  useEffect(() => {
    if (!isAdmin) return;
    projects
      .listDeletedForOrg(org.id)
      .then(setDeleted)
      .catch(() => setDeleted([]));
  }, [isAdmin, org.id]);
  async function restoreProject(id: string) {
    setRestoring(id);
    try {
      await projects.restore(id);
      setDeleted((prev) => (prev ? prev.filter((p) => p.id !== id) : prev));
      // The restored project re-enters the live list, so refresh it too.
      projects.listForOrg(org.id).then(setItems).catch(() => {});
    } catch {
      toast.error("Could not restore this project.");
    } finally {
      setRestoring(null);
    }
  }
  return (
    <div>
      <PageHeading
        eyebrow="Projects"
        title="All projects"
        action={
          <Link
            className="press-scale rounded-lg bg-signal-info px-3 py-2 text-sm font-medium text-console-950"
            href={`/orgs/${org.id}/projects/new`}
          >
            <Plus className="mr-1 inline h-4 w-4" />
            New project
          </Link>
        }
      />
      {error ? (
        <ErrorState message={error} />
      ) : !items ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <div className="surface-panel p-gutter-lg text-sm text-console-300">
          No projects yet.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((p) => (
            <Link
              className="surface-panel hover-lift row-hover p-gutter-lg"
              href={`/projects/${p.id}`}
              key={p.id}
            >
              <Folder className="mb-3 h-5 w-5 text-signal-info" />
              <div className="font-medium">{p.name}</div>
              <time className="mt-1 block text-xs text-console-400">
                Created {new Date(p.created_at).toLocaleDateString()}
              </time>
            </Link>
          ))}
        </div>
      )}
      {isAdmin && deleted && deleted.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <span className="text-xs tracking-widest text-console-400 uppercase">
              Recently deleted
            </span>
            <span className="text-xs text-console-400">
              {deleted.length} {deleted.length === 1 ? "project" : "projects"}
            </span>
          </div>
          {/* Lighter than the live list on purpose: these rows are not work
              someone is heading into, they are a recovery surface. */}
          <div className="surface-panel divide-y divide-console-600/60">
            {deleted.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-4 px-gutter py-3"
              >
                <div className="flex min-w-0 items-baseline gap-3">
                  <span className="truncate text-sm text-console-300">
                    {p.name}
                  </span>
                  {p.deleted_at && (
                    <span className="shrink-0 font-mono text-xs text-console-400">
                      {p.deleted_at.slice(0, 16).replace("T", " ")}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void restoreProject(p.id)}
                  disabled={restoring === p.id}
                  className="focus-console shrink-0 rounded-sm border border-console-500 px-2 py-1 text-xs text-console-200 transition-colors duration-150 hover:border-signal-info hover:text-signal-info disabled:pointer-events-none disabled:opacity-50"
                >
                  {restoring === p.id ? "Restoring…" : "Restore"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
