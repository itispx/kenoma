"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { orgs } from "@/lib/api";
import type { Organization } from "@/lib/types";
import { PageHeading, LoadingState, ErrorState } from "@/components/page-state";
import { OrgIcon } from "@/components/org-icon";
export default function DashboardPage() {
  const [items, setItems] = useState<Organization[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    orgs
      .list()
      .then((v) =>
        setItems(
          [...v].sort((a, b) => Number(b.is_personal) - Number(a.is_personal)),
        ),
      )
      .catch(() => setError("Could not load your workspaces."));
  }, []);
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
    </div>
  );
}
