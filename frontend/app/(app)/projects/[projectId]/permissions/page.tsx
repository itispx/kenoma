"use client";
/* eslint-disable react-hooks/exhaustive-deps */
import { use, useEffect, useMemo, useState } from "react";
import { grants, orgs, permissions } from "@/lib/api";
import type {
  OrgMember,
  Permission,
  PermissionGrant,
  PermissionKey,
} from "@/lib/types";
import { orgRoleLabel } from "@/lib/roles";
import { usePermissions } from "@/lib/use-permissions";
import { Checkbox } from "@/components/ui/checkbox";
import { useProject } from "@/components/project-context";
import { ErrorState, LoadingState } from "@/components/page-state";

// Column headings are the permission key without its namespace: the keys are
// the vocabulary this project's people already speak, and the full sentence
// for each one is spelled out in the legend under the table.
const columnLabel = (key: PermissionKey) =>
  key.replace("docs:", "").replaceAll("_", " ");

export default function PermissionsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  // The layout already fetched the project and puts it in context, so this page
  // does not repeat the request just to learn which org to list members from.
  const { project } = useProject();
  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [catalog, setCatalog] = useState<Permission[]>([]);
  const [assigned, setAssigned] = useState<PermissionGrant[]>([]);
  const [error, setError] = useState("");
  // Cells with a request in flight. The product waits for the server rather
  // than moving the box optimistically, so the cell has to say it is working.
  const [pending, setPending] = useState<Set<string>>(new Set());
  const { has, loading } = usePermissions(projectId);

  const cellId = (userId: string, key: PermissionKey) => `${userId}:${key}`;
  const loadGrants = () => grants.list(projectId).then(setAssigned);

  useEffect(() => {
    Promise.all([
      permissions.catalog(),
      orgs.listMembers(project.organization_id),
      loadGrants(),
    ])
      .then(([catalogRows, memberRows]) => {
        setCatalog(catalogRows);
        setMembers(memberRows);
      })
      .catch(() => setError("Could not load project access."));
  }, [projectId]);

  const lookup = useMemo(
    () => new Set(assigned.map((g) => cellId(g.user_id, g.permission_key))),
    [assigned],
  );

  async function toggle(member: OrgMember, p: Permission, on: boolean) {
    const id = cellId(member.user_id, p.key);
    setError("");
    setPending((current) => new Set(current).add(id));
    try {
      if (on) await grants.grant(projectId, member.user_id, p.key);
      else await grants.revoke(projectId, member.user_id, p.key);
      // Only the grants change; the catalog is static, so it is not refetched.
      await loadGrants();
    } catch {
      setError(
        `Could not ${on ? "grant" : "revoke"} "${columnLabel(p.key)}" for ${member.name}.`,
      );
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  // A failed load has nothing to show underneath it, and the matrix stays
  // hidden until the caller is known to be allowed to see it. The tab bar names
  // the surface, so these states do not repeat it.
  if (error && !members) return <ErrorState message={error} />;
  if (loading) return <LoadingState label="Loading permissions…" />;
  if (!has("docs:manage"))
    return (
      <ErrorState message="You do not have permission to manage project access." />
    );

  return (
    <div>
      {error && (
        <div className="mb-3">
          <ErrorState message={error} />
        </div>
      )}
      {!members || catalog.length === 0 ? (
        <LoadingState label="Loading members…" />
      ) : members.length === 0 ? (
        <div className="surface-panel p-gutter-lg text-sm text-console-300">
          This organization has no members yet. Invite someone before granting
          project access.
        </div>
      ) : (
        <>
          <div className="surface-panel overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">
                Project permissions by member. Each column is a permission; a
                checked box means the member has it.
              </caption>
              <thead>
                <tr className="border-b border-console-600 text-left text-xs tracking-wide text-console-400 uppercase">
                  {/* Sticky so the name stays visible while the matrix scrolls
                      sideways — without it a checked box on a narrow screen
                      belongs to nobody. */}
                  <th
                    scope="col"
                    className="sticky left-0 z-1 bg-console-800 p-gutter"
                  >
                    Member
                  </th>
                  {catalog.map((p) => (
                    <th
                      scope="col"
                      className="p-gutter text-center"
                      key={p.key}
                    >
                      {columnLabel(p.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const isAdmin = m.role === "admin";
                  return (
                    <tr
                      className="row-hover border-b border-console-600/60 last:border-b-0"
                      key={m.id}
                    >
                      <th
                        scope="row"
                        className="sticky left-0 z-1 bg-console-800 p-gutter text-left font-normal"
                      >
                        <div className="flex items-baseline gap-2">
                          <span className="text-console-50">{m.name}</span>
                          <span className="text-xs text-console-400">
                            {orgRoleLabel(m.role)}
                          </span>
                        </div>
                        <div className="text-xs text-console-400">
                          {m.email}
                        </div>
                      </th>
                      {catalog.map((p) => {
                        const id = cellId(m.user_id, p.key);
                        const busy = pending.has(id);
                        return (
                          <td className="p-gutter text-center" key={p.key}>
                            <span
                              className={`inline-flex transition-opacity duration-150 ${busy ? "opacity-40" : ""}`}
                            >
                              <Checkbox
                                aria-label={`${p.description} — for ${m.name}`}
                                aria-busy={busy || undefined}
                                checked={isAdmin || lookup.has(id)}
                                disabled={isAdmin || busy}
                                onCheckedChange={(next) => toggle(m, p, next)}
                              />
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-console-400">
            Organization admins hold every permission, so their boxes are fixed.
          </p>
          {/* The full sentence for each key, in reach of a keyboard rather than
              hidden in a tooltip on the column heading. */}
          <dl className="mt-5 grid gap-x-gutter-lg gap-y-2 sm:grid-cols-2">
            {catalog.map((p) => (
              <div key={p.key} className="flex flex-col">
                <dt className="font-mono text-xs text-console-300">{p.key}</dt>
                <dd className="text-xs text-console-400">{p.description}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}
