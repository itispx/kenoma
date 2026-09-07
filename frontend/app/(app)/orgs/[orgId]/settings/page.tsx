"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, orgs } from "@/lib/api";
import { useOrg } from "@/components/org-context";
import { Field, inputClass, primaryBtn } from "@/components/auth-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { ErrorState, PageHeading } from "@/components/page-state";
export default function OrgSettingsPage() {
  const org = useOrg(),
    router = useRouter();
  const [name, setName] = useState(org.name);
  const [canInvite, setCanInvite] = useState(org.members_can_invite);
  const [error, setError] = useState("");
  async function rename(e: FormEvent) {
    e.preventDefault();
    try {
      await orgs.update(org.id, { name });
      router.refresh();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? "Personal organizations cannot be renamed."
          : "Could not rename the organization.",
      );
    }
  }
  // The switch is optimistic in the control only: it flips back if the request fails, so the UI never claims a setting the server did not take.
  async function toggleInvites(next: boolean) {
    setCanInvite(next);
    setError("");
    try {
      await orgs.update(org.id, { members_can_invite: next });
      router.refresh();
    } catch {
      setCanInvite(!next);
      setError("Could not change who can invite people.");
    }
  }
  async function remove() {
    try {
      await orgs.remove(org.id);
      router.push("/dashboard");
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? "Personal organizations cannot be deleted."
          : "Could not delete the organization.",
      );
    }
  }
  if (org.role !== "admin")
    return (
      <div>
        <PageHeading eyebrow="Organization" title="Settings" />
        <ErrorState message="Only admins can change organization settings." />
      </div>
    );
  return (
    <div>
      <PageHeading eyebrow="Organization" title="Settings" />
      {error && (
        <div className="mb-3">
          <ErrorState message={error} />
        </div>
      )}
      <form onSubmit={rename} className="surface-panel mb-5 p-gutter-lg">
        <Field label="Organization name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Field>
        <button className={primaryBtn}>Save name</button>
      </form>
      <div className="surface-panel mb-5 flex items-start gap-4 p-gutter-lg">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="members-can-invite"
            className="block text-sm font-medium"
          >
            Members can invite people
          </label>
          <p className="mt-1 text-sm text-console-300">
            Anyone they invite joins as a member. Only admins can invite admins,
            rename this organization, or delete it.
          </p>
        </div>
        <Switch
          id="members-can-invite"
          checked={canInvite}
          onCheckedChange={toggleInvites}
        />
      </div>
      <div className="surface-panel border-signal-error/40 p-gutter-lg">
        <h2 className="font-medium text-signal-error">Danger zone</h2>
        <p className="my-2 text-sm text-console-300">
          Delete this organization and hide all its projects. Nothing is erased:
          an admin can restore it from the workspace dashboard.
        </p>
        <ConfirmDialog
          trigger={
            <button className="rounded-lg border border-signal-error px-3 py-2 text-sm text-signal-error">
              Delete organization
            </button>
          }
          title="Delete organization?"
          description="It disappears from every workspace listing. An admin can restore it from the workspace dashboard."
          confirm="Delete"
          onConfirm={remove}
        />
      </div>
    </div>
  );
}
