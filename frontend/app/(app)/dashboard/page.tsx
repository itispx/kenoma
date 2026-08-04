"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Folder, FileText, Plus } from "lucide-react";
import { projects as projectsApi } from "@/lib/api";
import { useActiveOrg } from "@/lib/org-store";
import { shortId, relativeTime } from "@/lib/format";
import type { Project } from "@/lib/types";

export default function DashboardPage() {
  const { activeOrgId, activeOrg, loading: orgLoading } = useActiveOrg();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (orgLoading) return;
    let cancelled = false;
    setLoading(true);
    projectsApi
      .list()
      .then((list) => {
        if (!cancelled) setProjects(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, orgLoading]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-console-400">Workspace</div>
          <h1 className="font-heading text-xl font-semibold">
            {activeOrg ? activeOrg.name : "Your"} projects
          </h1>
        </div>
        <Link
          href="/projects/new"
          className="hover-lift press-scale flex items-center gap-1.5 rounded-md border border-signal-info/50 bg-signal-info/10 px-3 py-1.5 text-sm text-signal-info hover:bg-signal-info/20 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New project
        </Link>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="surface-panel h-12 animate-pulse opacity-50" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="surface-panel bg-grid flex flex-col items-center gap-2 p-gutter-lg text-center">
          <FileText className="h-6 w-6 text-console-400" />
          <p className="text-sm text-console-300">
            {activeOrg
              ? `No projects in ${activeOrg.name} yet.`
              : "You don't have any projects yet."}
          </p>
          <Link href="/projects/new" className="text-sm text-signal-info hover:text-glow-info transition-all">
            Create your first project →
          </Link>
        </div>
      ) : (
        <div className="surface-panel divide-y divide-console-600/80">
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-gutter py-row-sm text-xs uppercase tracking-widest text-console-400">
            <span>Name</span>
            <span>Created</span>
            <span></span>
          </div>
          {projects.map((p, i) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              style={{ animationDelay: `${i * 40}ms` }}
              className="animate-stagger-in group grid grid-cols-[1fr_auto_auto] items-center gap-4 px-gutter py-row-sm row-hover"
            >
              <span className="flex items-center gap-2 truncate">
                <Folder className="h-4 w-4 shrink-0 text-console-400" />
                {p.name}
                <span className="font-mono text-xs text-console-500">{shortId(p.id)}</span>
              </span>
              <span className="text-xs text-console-400">{relativeTime(p.created_at)}</span>
              <span className="text-console-500 transition-transform group-hover:translate-x-0.5 group-hover:text-signal-info">
                →
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
