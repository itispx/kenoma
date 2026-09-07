"use client";
import { FormEvent, use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { projects } from "@/lib/api";
import { usePermissions } from "@/lib/use-permissions";
import { inputClass, secondaryBtn } from "@/components/auth-shell";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useProject } from "@/components/project-context";
import { ErrorState, LoadingState } from "@/components/page-state";

// One shape for every setting: what it is on the left, the control that changes
// it on the right. The organization settings page uses this row for its invite
// switch; here it is the whole page's structure, so a new setting is a new row
// rather than a new kind of box.
// The text takes whatever space is left and the control sits in an auto track,
// so every row's action lands on the same right edge no matter how long the
// description is.
const settingRow =
  "grid items-start gap-gutter sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-gutter-lg";

// A project is a record before it is a form. The console says so in its own
// voice: caption labels, values in mono because they are machine-shaped, and
// the same timestamp treatment the document list uses. Nothing here is
// decorative — the identifier is what support conversations and API calls need,
// which is why it can be copied rather than only read.
function IdentityStrip({ id, createdAt }: { id: string; createdAt: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <dl className="mb-8 grid gap-gutter border-b border-console-600/80 pb-gutter-lg sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-gutter-lg">
      <div>
        <dt className="text-[11px] font-medium tracking-wide text-console-400 uppercase">
          Identifier
        </dt>
        <dd className="mt-1 flex items-center gap-2">
          <span className="min-w-0 font-mono text-xs break-all text-console-100">
            {id}
          </span>
          <button
            type="button"
            onClick={copy}
            aria-label="Copy project identifier"
            className="focus-console flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius)] text-console-400 transition-colors hover:text-console-100"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-signal-success" aria-hidden />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
          {/* Announced rather than drawn as a tooltip: the icon carries the
              confirmation visually, this carries it for a screen reader. */}
          <span role="status" aria-live="polite" className="sr-only">
            {copied ? "Identifier copied" : ""}
          </span>
        </dd>
      </div>
      {/* Right-aligned so this label and its value sit on the same edge the
          controls below use. */}
      <div className="sm:text-right">
        <dt className="text-[11px] font-medium tracking-wide text-console-400 uppercase">
          Created
        </dt>
        <dd className="mt-1 font-mono text-xs text-console-100">
          {createdAt.slice(0, 16).replace("T", " ")}
        </dd>
      </div>
    </dl>
  );
}

export default function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params),
    router = useRouter();
  const { project, setProject } = useProject();
  const [draft, setDraft] = useState(project.name);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { has, loading } = usePermissions(projectId);
  const name = draft.trim();
  const unchanged = !name || name === project.name;
  // Renaming needs no success message: the project name in the heading above
  // these settings changes the moment the server confirms it.
  async function rename(e: FormEvent) {
    e.preventDefault();
    if (unchanged) return;
    setSaving(true);
    setError("");
    try {
      setProject(await projects.rename(projectId, name));
    } catch {
      setError("Could not rename this project.");
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    setDeleting(true);
    setError("");
    try {
      await projects.remove(projectId);
      router.push(`/orgs/${project.organization_id}/projects`);
    } catch {
      setError("Could not delete this project.");
      setDeleting(false);
    }
  }
  if (loading) return <LoadingState label="Loading settings…" />;
  // The server is the boundary; this only keeps the page from showing controls
  // every action behind them would refuse.
  if (!has("docs:manage"))
    return (
      <ErrorState message="You do not have permission to manage this project." />
    );
  return (
    <div>
      {error && (
        <div className="mb-5">
          <ErrorState message={error} />
        </div>
      )}
      <IdentityStrip id={project.id} createdAt={project.created_at} />
      <section className="surface-panel p-gutter-lg">
        <div className={settingRow}>
          <div className="min-w-0 max-w-prose">
            {/* The heading names the setting, so the field borrows it as its
                accessible name instead of repeating the words in a label. That
                is also why this does not use the shared Field: its uppercase
                caption would be the third copy of "project name" in one row. */}
            <h2
              id="project-name-label"
              className="text-sm font-medium text-console-50"
            >
              Project name
            </h2>
            <p id="project-name-hint" className="mt-1 text-sm text-console-300">
              Shown in the organization&rsquo;s project list and above every
              document in it.
            </p>
          </div>
          <form
            onSubmit={rename}
            className="flex w-full flex-wrap items-center gap-2 sm:w-80"
          >
            <input
              aria-labelledby="project-name-label"
              aria-describedby="project-name-hint"
              className={cn(inputClass, "min-w-0 flex-1")}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              required
            />
            {/* Outline rather than the mint fill: renaming is routine, and
                the accent is worth more reserved for the one act that starts
                something, which on this project is New document. */}
            <button
              disabled={saving || unchanged}
              className={cn(secondaryBtn, "w-auto shrink-0")}
            >
              {saving ? "Saving…" : "Save name"}
            </button>
          </form>
        </div>
      </section>

      {/* The gap carries the separation, so the container does not have to:
          tinting the border, the heading, and the button all magenta spends
          three signals on one reversible act. The colour lands on the control
          that does the damage and nowhere else. */}
      <section className="surface-panel mt-8 p-gutter-lg">
        <div className={settingRow}>
          <div className="min-w-0 max-w-prose">
            <h2 className="text-sm font-medium text-console-50">Danger zone</h2>
            <p className="mt-1 text-sm text-console-300">
              Deleting takes the project and its documents out of the
              organization. Nothing is erased: an organization admin can restore
              it.
            </p>
          </div>
          <ConfirmDialog
            trigger={
              <button
                disabled={deleting}
                className="focus-console w-auto justify-self-start rounded-lg border border-signal-error/60 px-3 py-2.5 text-sm font-medium text-signal-error transition-colors duration-150 hover:border-signal-error hover:bg-signal-error/10 disabled:pointer-events-none disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete project"}
              </button>
            }
            title="Delete this project?"
            description="It leaves the organization along with its documents. An organization admin can restore it."
            confirm="Delete project"
            onConfirm={remove}
          />
        </div>
      </section>
    </div>
  );
}
