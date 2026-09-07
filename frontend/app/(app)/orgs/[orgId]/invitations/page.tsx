"use client";
/* eslint-disable react-hooks/exhaustive-deps */
import { FormEvent, useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { ApiError, orgs } from "@/lib/api";
import type { Invitation, OrgRole } from "@/lib/types";
import { useOrg } from "@/components/org-context";
import { Field, inputClass, primaryBtn } from "@/components/auth-shell";
import { LoadingState, PageHeading } from "@/components/page-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ORG_ROLE_OPTIONS, orgRoleLabel } from "@/lib/roles";
export default function InvitationsPage() {
  const org = useOrg();
  const isAdmin = org.role === "admin";
  const [items, setItems] = useState<Invitation[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("member");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // The just-created invite's accept link, so the sender can copy it out of
  // the page instead of digging through the email/console delivery.
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const load = () =>
    orgs
      .listInvitations(org.id)
      .then(setItems)
      .catch(() => setError("Could not load invitations."));
  useEffect(() => {
    load();
  }, [org.id]);
  // A member may only ever add another member, so their form has no role control and sends the only role they are allowed to send.
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await orgs.invite(org.id, email, isAdmin ? role : "member");
      setEmail("");
      setCreatedLink(created.accept_link ?? null);
      setCopied(false);
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError && (e.status === 409 || e.status === 403)
          ? e.message
          : "Could not send the invitation.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    try {
      await orgs.revokeInvitation(org.id, id);
      await load();
    } catch {
      setError("Could not revoke the invitation.");
    }
  }
  async function copyLink() {
    if (!createdLink) return;
    try {
      await navigator.clipboard.writeText(createdLink);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div>
      <PageHeading eyebrow="Access" title="Invitations" />
      <form
        onSubmit={submit}
        className={`surface-panel mb-5 grid gap-3 p-gutter-lg ${isAdmin ? "sm:grid-cols-[1fr_auto_auto]" : "sm:grid-cols-[1fr_auto]"}`}
      >
        <Field
          label="Email"
          error={error}
          hint={isAdmin ? undefined : "They will join as a member."}
        >
          <input
            className={inputClass}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        {isAdmin && (
          <Field label="Role">
            <Select
              items={ORG_ROLE_OPTIONS}
              value={role}
              onValueChange={(v) => setRole(v as OrgRole)}
            >
              <SelectTrigger aria-label="Role" className="min-w-28">
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
          </Field>
        )}
        <button
          disabled={busy}
          className={`${primaryBtn} self-start sm:mt-[1.25rem] sm:w-auto`}
        >
          {busy ? "Sending…" : "Invite"}
        </button>
      </form>
      {createdLink && (
        <div className="surface-panel mb-5 p-gutter">
          <p className="text-sm text-console-100">Invitation sent.</p>
          <p className="mt-1 text-xs text-console-300">
            Share this link with the person you invited. It stops working once
            accepted or revoked.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-sm border border-console-600 bg-console-950 px-2 py-1.5 font-mono text-xs text-console-100">
              {createdLink}
            </code>
            <button
              type="button"
              onClick={() => void copyLink()}
              aria-label="Copy invitation link"
              className="focus-console flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-console-400 transition-colors hover:text-console-100"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-signal-success" aria-hidden />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
            <span role="status" aria-live="polite" className="sr-only">
              {copied ? "Invitation link copied" : ""}
            </span>
          </div>
        </div>
      )}
      {!items ? (
        <LoadingState />
      ) : (
        <div className="surface-panel divide-y divide-console-600">
          {items.length === 0 ? (
            <div className="p-gutter text-sm text-console-400">
              No pending invitations.
            </div>
          ) : (
            items.map((i) => (
              <div
                key={i.id}
                className="row-hover flex items-center gap-3 p-gutter"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{i.email}</div>
                  <div className="text-xs text-console-400">
                    {orgRoleLabel(i.role)} · expires{" "}
                    {new Date(i.expires_at).toLocaleDateString()}
                  </div>
                </div>
                {i.can_revoke && (
                  <button
                    onClick={() => revoke(i.id)}
                    className="text-sm text-signal-error"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
