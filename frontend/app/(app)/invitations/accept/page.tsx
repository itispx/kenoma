"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, orgs } from "@/lib/api";
import { ErrorState, LoadingState, PageHeading } from "@/components/page-state";
export default function AcceptInvitationPage() {
  const token = useSearchParams().get("token"),
    router = useRouter();
  const [requestError, setError] = useState("");
  useEffect(() => {
    if (!token) return;
    orgs
      .acceptInvitation(token)
      .then((o) => router.replace(`/orgs/${o.id}/projects`))
      .catch((e) =>
        setError(
          e instanceof ApiError && e.status === 400
            ? "This invitation is invalid or has expired."
            : "Could not accept this invitation.",
        ),
      );
  }, [token, router]);
  const error = token
    ? requestError
    : "This invitation link is missing its token.";
  return (
    <div className="mx-auto max-w-lg">
      <PageHeading eyebrow="Invitation" title="Joining organization" />
      {error ? (
        <>
          <ErrorState message={error} />
          <Link
            className="mt-4 inline-block text-sm text-signal-info"
            href="/dashboard"
          >
            Back to dashboard
          </Link>
        </>
      ) : (
        <LoadingState label="Accepting invitation…" />
      )}
    </div>
  );
}
