"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { orgs as orgsApi, ApiError } from "@/lib/api";
import { useActiveOrg } from "@/lib/org-store";

function AcceptInvitationInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { refreshOrgs } = useActiveOrg();
  const [state, setState] = useState<"pending" | "success" | "error">("pending");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("Missing invitation token.");
      return;
    }
    orgsApi
      .acceptInvitation(token)
      .then(async () => {
        await refreshOrgs();
        setState("success");
      })
      .catch((err) => {
        setState("error");
        setMessage(err instanceof ApiError ? err.message : "Failed to accept invitation.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (state === "pending") {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-signal-info" />
        <p className="text-sm text-console-300">Accepting your invitation…</p>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="animate-stagger-in flex flex-col items-center gap-3 py-4 text-center">
        <XCircle className="h-8 w-8 text-signal-error" />
        <p className="text-sm text-signal-error">{message}</p>
      </div>
    );
  }
  return (
    <div className="animate-stagger-in flex flex-col items-center gap-3 py-4 text-center">
      <CheckCircle2 className="h-8 w-8 text-signal-success" />
      <p className="text-sm text-console-200">
        You&apos;ve joined the organization. Switch to it from the workspace menu in the header.
      </p>
      <Link
        href="/dashboard"
        className="hover-lift press-scale rounded-md border border-signal-info/50 bg-signal-info/10 px-3 py-2 text-sm text-signal-info hover:bg-signal-info/20 transition-colors"
      >
        Go to dashboard
      </Link>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-center font-heading text-xl font-semibold">Organization invitation</h1>
      <div className="surface-panel bg-grid p-gutter-lg">
        <Suspense>
          <AcceptInvitationInner />
        </Suspense>
      </div>
    </div>
  );
}
