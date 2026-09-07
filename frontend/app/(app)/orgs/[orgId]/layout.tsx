"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { orgs, ApiError } from "@/lib/api";
import type { Organization } from "@/lib/types";
import { useNavStore } from "@/lib/nav-store";
import { OrgContext } from "@/components/org-context";
import {
  ErrorState,
  LoadingState,
  notFoundCopy,
} from "@/components/page-state";
export default function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = use(params);
  const [org, setOrg] = useState<Organization | null>(null);
  const [error, setError] = useState("");
  const pathname = usePathname();
  const setOrgId = useNavStore((s) => s.setOrgId);
  // Tell the shell's sidebar which workspace this page belongs to. The orgId
  // is known without a fetch, so it publishes immediately rather than after
  // the org detail resolves.
  useEffect(() => {
    setOrgId(orgId);
    return () => {
      if (useNavStore.getState().orgId === orgId) setOrgId(null);
    };
  }, [orgId, setOrgId]);
  useEffect(() => {
    orgs
      .get(orgId)
      .then(setOrg)
      .catch((e) =>
        setError(
          e instanceof ApiError && e.status === 404
            ? notFoundCopy
            : "Could not load this organization.",
        ),
      );
  }, [orgId]);
  if (error) return <ErrorState message={error} />;
  if (!org) return <LoadingState label="Loading organization…" />;
  // Tabs mirror what the caller may actually do: members get the roster
  // read-only, the invitations tab only when an admin has delegated inviting,
  // and never the settings tab, since renaming and deleting stay admin-only.
  const isAdmin = org.role === "admin";
  const tabs = [
    { label: "Projects", path: "projects" },
    ...(!org.is_personal ? [{ label: "Members", path: "members" }] : []),
    ...(!org.is_personal && (isAdmin || org.members_can_invite)
      ? [{ label: "Invitations", path: "invitations" }]
      : []),
    ...(!org.is_personal && isAdmin
      ? [{ label: "Settings", path: "settings" }]
      : []),
  ];
  return (
    <OrgContext.Provider value={org}>
      <div className="mb-6">
        <div className="text-xs uppercase tracking-widest text-console-400">
          Organization
        </div>
        <h1 className="font-heading text-xl font-semibold">
          {org.is_personal ? "Personal" : org.name}
        </h1>
      </div>
      <nav
        className="mb-6 flex gap-1 border-b border-console-600"
        aria-label="Organization"
      >
        <>
          {tabs.map((t) => {
            const href = `/orgs/${org.id}/${t.path}`;
            return (
              <Link
                key={t.path}
                href={href}
                className={`focus-console rounded-t-lg px-3 py-2 text-sm ${pathname.startsWith(href) ? "border-b-2 border-signal-info text-console-50" : "text-console-400 hover:text-console-100"}`}
              >
                {t.label}
              </Link>
            );
          })}
        </>
      </nav>
      {children}
    </OrgContext.Provider>
  );
}
