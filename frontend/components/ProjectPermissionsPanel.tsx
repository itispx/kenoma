"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Shield } from "lucide-react";
import { orgs as orgsApi, permissionsApi } from "@/lib/api";
import type { OrgMember, Permission, PermissionKey, ProjectPermissionGrant } from "@/lib/types";

function humanizePermission(key: PermissionKey): string {
  const word = key.replace("docs:", "").replace(/_/g, " ");
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// Grid of member x permission toggle cells, scoped to one project. Org
// admins aren't shown a row here — they bypass this table entirely per the
// permission model, so there's nothing to grant/revoke for them.
export function ProjectPermissionsPanel({
  projectId,
  organizationId,
}: {
  projectId: string;
  organizationId: string;
}) {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [grants, setGrants] = useState<ProjectPermissionGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const [memberList, permList, grantList] = await Promise.all([
      orgsApi.listMembers(organizationId),
      permissionsApi.listAll(),
      permissionsApi.listGrants(projectId),
    ]);
    setMembers(memberList.filter((m) => m.role === "member"));
    setAllPermissions(permList);
    setGrants(grantList);
    setLoading(false);
  }, [projectId, organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  function isGranted(memberId: string, key: PermissionKey) {
    return grants.some((g) => g.organization_member_id === memberId && g.permission_key === key);
  }

  async function toggle(memberId: string, key: PermissionKey, currentlyGranted: boolean) {
    const cellId = `${memberId}:${key}`;
    setPending((prev) => new Set(prev).add(cellId));
    try {
      if (currentlyGranted) {
        await permissionsApi.revoke(projectId, memberId, key);
      } else {
        await permissionsApi.grant(projectId, memberId, key);
      }
      await load();
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(cellId);
        return next;
      });
    }
  }

  if (loading) return <p className="text-sm text-console-400">Loading permissions…</p>;

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <Shield className="h-5 w-5 text-console-400" />
        <p className="text-sm text-console-400">
          No members yet — once you invite teammates, you can decide exactly what each of them can do
          here. Admins can already do everything.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-xs">
        <thead>
          <tr className="text-left text-console-400">
            <th className="sticky left-0 bg-console-800 px-2 py-1.5 font-medium uppercase tracking-wide">
              Member
            </th>
            {allPermissions.map((p) => (
              <th
                key={p.key}
                className="px-2 py-1.5 font-medium uppercase tracking-wide"
                title={p.description}
              >
                {humanizePermission(p.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((m, i) => (
            <tr
              key={m.id}
              style={{ animationDelay: `${i * 40}ms` }}
              className="animate-stagger-in border-t border-console-600/80"
            >
              <td className="sticky left-0 whitespace-nowrap bg-console-800 px-2 py-1.5">
                <div className="text-console-50">{m.name}</div>
                <div className="text-[10px] text-console-400">{m.email}</div>
              </td>
              {allPermissions.map((p) => {
                const granted = isGranted(m.id, p.key);
                const cellId = `${m.id}:${p.key}`;
                const isPending = pending.has(cellId);
                return (
                  <td key={p.key} className="px-2 py-1.5 text-center">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => toggle(m.id, p.key, granted)}
                      title={p.description}
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-md border transition-all duration-200 active:scale-90 ${
                        granted
                          ? "border-signal-info/60 bg-signal-info/20 text-signal-info shadow-glow-info scale-100"
                          : "border-console-600 text-transparent hover:border-console-500"
                      }`}
                    >
                      {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
