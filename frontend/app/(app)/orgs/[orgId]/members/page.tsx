"use client";
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from "react";
import { ApiError, orgs } from "@/lib/api";
import type { OrgMember, OrgRole } from "@/lib/types";
import { useOrg } from "@/components/org-context";
import { ErrorState, LoadingState, PageHeading } from "@/components/page-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ORG_ROLE_OPTIONS, orgRoleLabel } from "@/lib/roles";
export default function MembersPage() {
  const org = useOrg();
  const isAdmin = org.role === "admin";
  const [items, setItems] = useState<OrgMember[] | null>(null);
  const [error, setError] = useState("");
  const load = () =>
    orgs
      .listMembers(org.id)
      .then(setItems)
      .catch(() => setError("Could not load members."));
  useEffect(() => {
    load();
  }, [org.id]);
  async function role(m: OrgMember, value: OrgRole) {
    setError("");
    try {
      await orgs.updateMemberRole(org.id, m.id, value);
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? "The organization must keep at least one admin."
          : "Could not update this member.",
      );
    }
  }
  async function remove(m: OrgMember) {
    setError("");
    try {
      await orgs.removeMember(org.id, m.id);
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? "The organization must keep at least one admin."
          : "Could not remove this member.",
      );
    }
  }
  return (
    <div>
      <PageHeading eyebrow="Access" title="Members" />
      {error && (
        <div className="mb-3">
          <ErrorState message={error} />
        </div>
      )}
      {!items ? (
        <LoadingState />
      ) : (
        <div className="surface-panel divide-y divide-console-600">
          {items.map((m) => (
            <div
              key={m.id}
              className="row-hover flex flex-wrap items-center gap-3 p-gutter"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{m.name}</div>
                <div className="truncate text-xs text-console-400">
                  {m.email}
                </div>
              </div>
              {isAdmin ? (
                <>
                  <Select
                    items={ORG_ROLE_OPTIONS}
                    value={m.role}
                    onValueChange={(v) => role(m, v as OrgRole)}
                  >
                    <SelectTrigger
                      size="sm"
                      aria-label={`Role for ${m.name}`}
                      className="w-32 shrink-0"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORG_ROLE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <ConfirmDialog
                    trigger={
                      <button className="text-sm text-signal-error">
                        Remove
                      </button>
                    }
                    title="Remove member?"
                    description={`${m.name} will lose access to this organization.`}
                    confirm="Remove"
                    onConfirm={() => remove(m)}
                  />
                </>
              ) : (
                <span className="shrink-0 text-sm text-console-300">
                  {orgRoleLabel(m.role)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
