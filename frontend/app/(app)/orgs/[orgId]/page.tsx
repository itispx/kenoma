"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Shield, User as UserIcon, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { orgs as orgsApi, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { useActiveOrg } from "@/lib/org-store";
import { shortId } from "@/lib/format";
import type { OrgMember, OrgRole } from "@/lib/types";

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-panel p-gutter-lg">
      <h2 className="font-heading text-base font-semibold">{title}</h2>
      {subtitle && <p className="mt-1 text-xs text-console-400">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export default function OrgSettingsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { user } = useAuth();
  const { orgs } = useActiveOrg();
  const org = orgs.find((o) => o.id === orgId);

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePending, setInvitePending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMembers(await orgsApi.listMembers(orgId));
    } catch (err) {
      toast.error("Couldn't load members", { description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  const me = members.find((m) => m.user_id === user?.id);
  const isAdmin = me?.role === "admin";

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setInvitePending(true);
    try {
      const inv = await orgsApi.invite(orgId, inviteEmail);
      toast.success("Invitation sent", {
        description: `We've sent an invite to ${inv.email}.`,
      });
      setInviteEmail("");
    } catch (err) {
      toast.error("Couldn't send invitation", { description: err instanceof ApiError ? err.message : undefined });
    } finally {
      setInvitePending(false);
    }
  }

  async function changeRole(memberId: string, role: OrgRole) {
    try {
      await orgsApi.updateMemberRole(orgId, memberId, role);
      load();
    } catch (err) {
      toast.error("Couldn't update role", { description: err instanceof ApiError ? err.message : undefined });
    }
  }

  async function remove(memberId: string) {
    if (!confirm("Remove this member from the organization?")) return;
    try {
      await orgsApi.removeMember(orgId, memberId);
      load();
    } catch (err) {
      toast.error("Couldn't remove member", { description: err instanceof ApiError ? err.message : undefined });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/dashboard" className="mb-4 flex items-center gap-1.5 text-xs text-console-400 hover:text-signal-info transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to projects
        </Link>
        <h1 className="font-heading text-xl font-semibold">{org?.name ?? "Organization"} settings</h1>
        {org && (
          <p className="mt-1 text-xs text-console-400">
            <span className="font-mono">{org.slug}</span> · <span className="font-mono">{shortId(org.id)}</span>
          </p>
        )}
      </div>

      <Section title="Members">
        {loading ? (
          <p className="text-sm text-console-400">Loading…</p>
        ) : (
          <div className="divide-y divide-console-600/80 -mx-gutter-lg">
            {members.map((m, i) => (
              <div
                key={m.id}
                style={{ animationDelay: `${i * 40}ms` }}
                className="animate-stagger-in flex items-center gap-3 px-gutter-lg py-row-sm"
              >
                {m.role === "admin" ? (
                  <Shield className="h-4 w-4 shrink-0 text-signal-info" />
                ) : (
                  <UserIcon className="h-4 w-4 shrink-0 text-console-400" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{m.name}</div>
                  <div className="truncate text-xs text-console-400">{m.email}</div>
                </div>
                {isAdmin && m.user_id !== user?.id ? (
                  <select
                    value={m.role}
                    onChange={(e) => changeRole(m.id, e.target.value as OrgRole)}
                    className="rounded-md border border-console-500 bg-console-900 px-1.5 py-0.5 text-xs"
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </select>
                ) : (
                  <span className="text-xs capitalize text-console-400">{m.role}</span>
                )}
                {isAdmin && m.user_id !== user?.id && (
                  <button onClick={() => remove(m.id)} className="text-console-400 hover:text-signal-error transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-console-500">
          Fine-grained permissions (who can review, approve, or export) are set per-project — open a
          project and use its permissions panel.
        </p>
      </Section>

      {isAdmin && (
        <Section title="Invite a teammate" subtitle="They'll get an email with a link to join.">
          <form onSubmit={invite} className="flex max-w-md gap-2">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="flex-1 rounded-md border border-console-500 bg-console-900 px-3 py-2 text-sm placeholder:text-console-400 focus-console transition-shadow"
            />
            <button
              type="submit"
              disabled={invitePending}
              className="hover-lift press-scale flex items-center gap-1.5 rounded-md border border-signal-info/50 bg-signal-info/10 px-3 py-2 text-sm text-signal-info hover:bg-signal-info/20 transition-colors disabled:opacity-50"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Invite
            </button>
          </form>
        </Section>
      )}
    </div>
  );
}
