"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { orgs } from "@/lib/api";
import type { Organization } from "@/lib/types";
import { PageHeading, LoadingState, ErrorState } from "@/components/page-state";
import { OrgIcon } from "@/components/org-icon";
export default function DashboardPage() {
  const [items, setItems] = useState<Organization[] | null>(null);
  const [deleted, setDeleted] = useState<Organization[] | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState("");
  const loadItems = useCallback(() => {
    orgs
      .list()
      .then((v) =>
        setItems(
          [...v].sort((a, b) => Number(b.is_personal) - Number(a.is_personal)),
        ),
      )
      .catch(() => setError("Could not load your workspaces."));
  }, []);
  useEffect(() => {
    loadItems();
    // Deleted orgs drop out of the live list, so an admin who removed one can
    // only find it again here. The endpoint is admin-scoped per org, so this
    // is safe to load for everyone.
    orgs.listDeleted().then(setDeleted).catch(() => setDeleted([]));
  }, [loadItems]);
  async function restoreOrg(id: string) {
    setRestoring(id);
    try {
      await orgs.restore(id);
      setDeleted((prev) => (prev ? prev.filter((o) => o.id !== id) : prev));
      // The restored org re-enters the live list, so refresh it too.
      loadItems();
    } catch {
      toast.error("Could not restore this organization.");
    } finally {
      setRestoring(null);
    }
  }
  return (
    <div>
      <PageHeading
        eyebrow="Workspace"
        title="Your organizations"
        action={
          <Link
            className="press-scale rounded-lg bg-signal-info px-3 py-2 text-sm font-medium text-console-950"
            href="/orgs/new"
          >
            <Plus className="mr-1 inline h-4 w-4" />
            New organization
          </Link>
        }
      />
      {error ? (
        <ErrorState message={error} />
      ) : !items ? (
        <LoadingState />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((o) => (
            <Link
              key={o.id}
              href={`/orgs/${o.id}/projects`}
              className="surface-panel hover-lift row-hover p-gutter-lg"
            >
              <OrgIcon
                isPersonal={o.is_personal}
                className="mb-3 h-5 w-5 text-signal-info"
              />
              <div className="font-medium">
                {o.is_personal ? "Personal" : o.name}
              </div>
              <div className="mt-1 text-xs uppercase tracking-wide text-console-400">
                {o.role ?? "workspace"}
              </div>
            </Link>
          ))}
        </div>
      )}
      {deleted && deleted.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <span className="text-xs tracking-widest text-console-400 uppercase">
              Recently deleted
            </span>
            <span className="text-xs text-console-400">
              {deleted.length}{" "}
              {deleted.length === 1 ? "organization" : "organizations"}
            </span>
          </div>
          {/* Lighter than the live list on purpose: these rows are not work
              someone is heading into, they are a recovery surface. */}
          <div className="surface-panel divide-y divide-console-600/60">
            {deleted.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between gap-4 px-gutter py-3"
              >
                <div className="flex min-w-0 items-baseline gap-3">
                  <span className="truncate text-sm text-console-300">
                    {o.is_personal ? "Personal" : o.name}
                  </span>
                  {o.deleted_at && (
                    <span className="shrink-0 font-mono text-xs text-console-400">
                      {o.deleted_at.slice(0, 16).replace("T", " ")}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void restoreOrg(o.id)}
                  disabled={restoring === o.id}
                  className="focus-console shrink-0 rounded-sm border border-console-500 px-2 py-1 text-xs text-console-200 transition-colors duration-150 hover:border-signal-info hover:text-signal-info disabled:pointer-events-none disabled:opacity-50"
                >
                  {restoring === o.id ? "Restoring…" : "Restore"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}