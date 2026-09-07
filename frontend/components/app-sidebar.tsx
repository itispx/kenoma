"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  FileText,
  Folder,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { documents, orgs, projects } from "@/lib/api";
import type { DocSummary, Organization, Project } from "@/lib/types";
import { useNavStore } from "@/lib/nav-store";
import { OrgIcon } from "@/components/org-icon";
import { cn } from "@/lib/utils";

const SIDEBAR_STORAGE = "kenoma:sidebar-collapsed";

// One project's document list once fetched. Absent means "in flight": the
// first fetch is kicked off the moment the project opens, and the row just
// shows a loading line until the response lands (no loading flag to reset).
type DocListEntry =
  | { status: "ready"; list: DocSummary[] }
  | { status: "error" };

// The shell's left navigation: the active org's projects, each expandable to
// its documents. The tree is derived rather than a second source of truth —
// layouts publish the current org/project/document to the nav store, and this
// component (which lives above them) subscribes.
export function AppSidebar() {
  const pathname = usePathname();
  const { orgId, projectId, documentId, setOrgId } = useNavStore();

  const [orgsList, setOrgsList] = useState<Organization[] | null>(null);
  const [projectsList, setProjectsList] = useState<Project[] | null>(null);
  const [projectsError, setProjectsError] = useState("");
  // Which org the list above belongs to. The org id may change faster than a
  // fetch resolves, so the old org's list must not render under the new one —
  // tracked explicitly rather than nulled out synchronously.
  const [projectsOrgId, setProjectsOrgId] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [docs, setDocs] = useState<Record<string, DocListEntry>>({});

  // The shell gates on the boot screen before mounting this, so there is no
  // SSR render and the lazy initializer can read localStorage directly.
  const [collapsed, setCollapsed] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem(SIDEBAR_STORAGE) === "1",
  );
  const toggleCollapsed = () => {
    const next = !collapsed;
    window.localStorage.setItem(SIDEBAR_STORAGE, next ? "1" : "0");
    setCollapsed(next);
  };

  // The orgs list names the active workspace and gives /dashboard a sensible
  // default when nothing has been visited yet (personal space first, same
  // ordering as the dashboard page).
  useEffect(() => {
    let cancelled = false;
    orgs
      .list()
      .then((list) => {
        if (!cancelled) setOrgsList(list);
      })
      .catch(() => {
        if (!cancelled) setOrgsList([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fallbackOrgId = useMemo(() => {
    if (!orgsList?.length) return null;
    const sorted = [...orgsList].sort(
      (a, b) => Number(b.is_personal) - Number(a.is_personal),
    );
    return sorted[0].id;
  }, [orgsList]);
  const activeOrgId = orgId ?? fallbackOrgId;
  const activeOrg = orgsList?.find((o) => o.id === activeOrgId) ?? null;

  // A cold load on /documents or /change-requests knows the project but not
  // the org it sits in; back the org out of the project once, then the normal
  // org-driven effect takes over.
  useEffect(() => {
    if (orgId || !projectId) return;
    let cancelled = false;
    projects
      .get(projectId)
      .then((p) => {
        if (!cancelled) setOrgId(p.organization_id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [orgId, projectId, setOrgId]);

  useEffect(() => {
    if (!activeOrgId) return;
    let cancelled = false;
    projects
      .listForOrg(activeOrgId)
      .then((list) => {
        if (cancelled) return;
        setProjectsList(list);
        setProjectsOrgId(activeOrgId);
        setProjectsError("");
      })
      .catch(() => {
        if (cancelled) return;
        setProjectsList(null);
        setProjectsOrgId(activeOrgId);
        setProjectsError("Could not load projects.");
      });
    return () => {
      cancelled = true;
    };
  }, [activeOrgId]);

  const toggleProject = (id: string) =>
    setExpanded((e) => ({ ...e, [id]: !(e[id] ?? id === projectId) }));

  // The active project opens by default; an explicit toggle overrides that.
  // Docs load lazily per open project and refetch whenever the open set or the
  // route changes (stale-while-revalidate), so a document created or imported
  // on another page shows up without a manual refetch.
  const openKey = (projectsList ?? [])
    .filter((p) => expanded[p.id] ?? p.id === projectId)
    .map((p) => p.id)
    .join("|");
  useEffect(() => {
    const ids = openKey ? openKey.split("|") : [];
    for (const pid of ids) {
      documents
        .listForProject(pid)
        .then((list) =>
          setDocs((all) => ({ ...all, [pid]: { status: "ready", list } })),
        )
        .catch(() => setDocs((all) => ({ ...all, [pid]: { status: "error" } })));
    }
  }, [openKey, pathname]);

  if (collapsed) {
    return (
      <aside className="sticky top-14 z-20 hidden h-[calc(100vh-3.5rem)] w-11 shrink-0 border-r border-console-600/80 bg-console-950/90 md:block">
        <div className="flex flex-col items-center pt-2">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="focus-console rounded-sm p-1.5 text-console-400 hover:text-console-100"
          >
            <PanelLeftOpen className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </aside>
    );
  }

  const projectsLoaded = projectsOrgId === activeOrgId;

  return (
    <aside className="sticky top-14 z-20 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 border-r border-console-600/80 bg-console-950/90 md:block">
      <div className="flex h-full w-64 flex-col">
        <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-console-600/60 pl-3 pr-1.5">
          {activeOrg ? (
            <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <OrgIcon
                isPersonal={activeOrg.is_personal}
                className="h-4 w-4 shrink-0 text-signal-info"
              />
              <span className="truncate">
                {activeOrg.is_personal ? "Personal" : activeOrg.name}
              </span>
            </span>
          ) : (
            <span className="text-xs text-console-400">Workspace</span>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="focus-console shrink-0 rounded-sm p-1.5 text-console-400 hover:text-console-100"
          >
            <PanelLeftClose className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <nav
          aria-label="Projects"
          className="flex-1 overflow-y-auto overscroll-contain p-2"
        >
          <div className="flex items-baseline justify-between px-1.5 pb-1.5 pt-1">
            <span className="text-[11px] font-medium uppercase tracking-widest text-console-400">
              Projects
            </span>
            {projectsLoaded && projectsList && (
              <span className="text-[11px] text-console-400">
                {projectsList.length}
              </span>
            )}
          </div>

          {projectsError && projectsLoaded ? (
            <div className="px-1.5 py-2 text-xs text-signal-error">
              {projectsError}
            </div>
          ) : !orgsList ? (
            <div className="space-y-2 px-1.5 py-1">
              <div className="h-4 w-[86%] animate-pulse rounded-sm bg-console-700/70" />
              <div className="h-4 w-[70%] animate-pulse rounded-sm bg-console-700/70" />
              <div className="h-4 w-[55%] animate-pulse rounded-sm bg-console-700/70" />
            </div>
          ) : orgsList.length === 0 ? (
            <div className="px-1.5 py-4 text-xs text-console-400">
              No workspaces yet.{" "}
              <Link
                href="/orgs/new"
                className="text-signal-info underline-offset-4 hover:underline"
              >
                Create one
              </Link>
            </div>
          ) : !projectsLoaded || !projectsList ? (
            <div className="space-y-2 px-1.5 py-1">
              <div className="h-4 w-[86%] animate-pulse rounded-sm bg-console-700/70" />
              <div className="h-4 w-[70%] animate-pulse rounded-sm bg-console-700/70" />
              <div className="h-4 w-[55%] animate-pulse rounded-sm bg-console-700/70" />
            </div>
          ) : projectsList.length === 0 ? (
            <div className="px-1.5 py-4 text-xs text-console-400">
              No projects yet.
            </div>
          ) : (
            <ul>
              {projectsList.map((p) => {
                const activeProject = projectId === p.id;
                const open = expanded[p.id] ?? activeProject;
                const entry = docs[p.id];
                return (
                  <li key={p.id}>
                    <div
                      className={cn(
                        "group flex items-center rounded-sm",
                        activeProject && "bg-console-700/40",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleProject(p.id)}
                        aria-expanded={open}
                        aria-label={`${open ? "Collapse" : "Expand"} ${p.name}`}
                        className="focus-console flex h-7 w-6 shrink-0 items-center justify-center rounded-sm text-console-400 hover:text-console-100"
                      >
                        <ChevronRight
                          className={cn(
                            "h-3.5 w-3.5 transition-transform duration-150",
                            open && "rotate-90",
                          )}
                          aria-hidden
                        />
                      </button>
                      <Link
                        href={`/projects/${p.id}`}
                        aria-current={activeProject ? "page" : undefined}
                        className={cn(
                          "focus-console flex min-w-0 flex-1 items-center gap-2 rounded-sm px-1 py-1.5 text-sm",
                          activeProject
                            ? "text-signal-info"
                            : "text-console-200 hover:text-console-50",
                        )}
                      >
                        <Folder
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            activeProject
                              ? "text-signal-info"
                              : "text-console-400 group-hover:text-console-200",
                          )}
                        />
                        <span className="truncate">{p.name}</span>
                      </Link>
                    </div>
                    {open && (
                      <ul className="ml-6 border-l border-console-600/40 pl-2">
                        {!entry ? (
                          <li className="px-2 py-1.5 text-xs text-console-400">
                            Loading…
                          </li>
                        ) : entry.status === "error" ? (
                          <li className="px-2 py-1.5 text-xs text-signal-error">
                            Could not load documents.
                          </li>
                        ) : entry.list.length ? (
                          entry.list.map((d) => {
                            const activeDocument = documentId === d.id;
                            return (
                              <li key={d.id}>
                                <Link
                                  href={`/documents/${d.id}`}
                                  aria-current={
                                    activeDocument ? "page" : undefined
                                  }
                                  className={cn(
                                    "focus-console flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                                    activeDocument
                                      ? "bg-console-700/40 text-signal-info"
                                      : "text-console-300 hover:text-console-50",
                                  )}
                                >
                                  <FileText
                                    className={cn(
                                      "h-3.5 w-3.5 shrink-0",
                                      activeDocument
                                        ? "text-signal-info"
                                        : "text-console-400",
                                    )}
                                  />
                                  <span className="min-w-0 flex-1 truncate">
                                    {d.title}
                                  </span>
                                  {!d.head_revision_id && (
                                    <span
                                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-signal-warning"
                                      title="Initial draft"
                                      aria-label="Initial draft"
                                    />
                                  )}
                                </Link>
                              </li>
                            );
                          })
                        ) : (
                          <li className="px-2 py-1.5 text-xs text-console-400">
                            No documents
                          </li>
                        )}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </nav>
      </div>
    </aside>
  );
}