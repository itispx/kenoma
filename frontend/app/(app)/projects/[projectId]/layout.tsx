"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ApiError, orgs, projects } from "@/lib/api";
import type { Project } from "@/lib/types";
import { useNavStore } from "@/lib/nav-store";
import { usePermissions } from "@/lib/use-permissions";
import { ProjectContext } from "@/components/project-context";
import {
  ErrorState,
  LoadingState,
  notFoundCopy,
} from "@/components/page-state";
export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  // Only for the back link's label. The switcher in the header reads the org
  // out of the URL, and this route has no /orgs segment, so without this the
  // page never names the workspace it belongs to.
  const [orgName, setOrgName] = useState<string | null>(null);
  const [error, setError] = useState("");
  const pathname = usePathname();
  const { has, loading } = usePermissions(projectId);
  const { setOrgId, setProjectId } = useNavStore();
  useEffect(() => {
    if (!project) return;
    setOrgId(project.organization_id);
    setProjectId(project.id);
    return () => {
      if (useNavStore.getState().orgId === project.organization_id) {
        setOrgId(null);
      }
      if (useNavStore.getState().projectId === project.id) {
        setProjectId(null);
      }
    };
  }, [project, setOrgId, setProjectId]);
  useEffect(() => {
    projects
      .get(projectId)
      .then(setProject)
      .catch((e) =>
        setError(
          e instanceof ApiError && e.status === 404
            ? notFoundCopy
            : "Could not load this project.",
        ),
      );
  }, [projectId]);
  const organizationId = project?.organization_id;
  useEffect(() => {
    if (!organizationId) return;
    orgs
      .get(organizationId)
      .then((org) => setOrgName(org.is_personal ? "Personal" : org.name))
      .catch(() => {});
  }, [organizationId]);
  if (error) return <ErrorState message={error} />;
  if (!project) return <LoadingState label="Loading project…" />;
  const base = `/projects/${project.id}`;
  // Both manager-only tabs are hidden rather than shown-and-refused: their
  // pages already answer "not allowed" without docs:manage, and a tab that only
  // ever leads there is worse than no tab. The same reasoning the org layout
  // uses for its own settings tab.
  const canManage = !loading && has("docs:manage");
  const tabs = [
    { label: "Documents", href: base },
    ...(canManage
      ? [
          { label: "Permissions", href: `${base}/permissions` },
          { label: "Settings", href: `${base}/settings` },
        ]
      : []),
  ];
  return (
    <ProjectContext.Provider value={{ project, setProject }}>
      <div className="mb-6">
        {/* Takes the slot the "Project" label used to hold: the heading and
            the tabs below already say this is a project, and the one thing
            the page could not tell you was which workspace it sits in. */}
        <Link
          href={`/orgs/${project.organization_id}/projects`}
          className="focus-console -ml-1.5 mb-1.5 inline-flex items-center gap-2 rounded-sm px-1.5 py-1 text-xs text-console-400 hover:text-console-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {orgName ?? "Organization"}
        </Link>
        <h1 className="font-heading text-xl font-semibold">{project.name}</h1>
      </div>
      <nav
        className="mb-6 flex gap-1 border-b border-console-600"
        aria-label="Project"
      >
        {tabs.map((t) => {
          // The documents tab is the index route, so startsWith would light it
          // up on every child page as well.
          const active =
            t.href === base ? pathname === base : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`focus-console rounded-t-sm px-3 py-2 text-sm ${active ? "border-b-2 border-signal-info text-console-50" : "text-console-400 hover:text-console-100"}`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </ProjectContext.Provider>
  );
}
