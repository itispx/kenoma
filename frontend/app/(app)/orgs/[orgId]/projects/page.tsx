"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Folder, Plus } from "lucide-react";
import { projects } from "@/lib/api";
import type { Project } from "@/lib/types";
import { useOrg } from "@/components/org-context";
import { ErrorState, LoadingState, PageHeading } from "@/components/page-state";
export default function ProjectsPage() {
  const org = useOrg();
  const [items, setItems] = useState<Project[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    projects
      .listForOrg(org.id)
      .then(setItems)
      .catch(() => setError("Could not load projects."));
  }, [org.id]);
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
    </div>
  );
}
