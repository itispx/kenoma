"use client";

import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-store";

// Placeholder landing page for a signed-in user. The backend currently
// implements authentication only, so there is deliberately nothing here that
// implies projects or documents exist yet. This is the redirect target for
// login, register, and the "/" bounce.
export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div>
      <div className="mb-6">
        <div className="text-xs uppercase tracking-widest text-console-400">Workspace</div>
        <h1 className="font-heading text-xl font-semibold">
          {user?.name ? `Welcome back, ${user.name}` : "Welcome back"}
        </h1>
      </div>

      <div className="surface-panel bg-grid flex flex-col items-center gap-2 p-gutter-lg text-center">
        <ShieldCheck className="h-6 w-6 text-signal-success" />
        <p className="text-sm text-console-200">You&apos;re signed in.</p>
        <p className="max-w-sm text-sm text-console-400">
          Projects, documents, and reviews aren&apos;t available yet. They&apos;ll show up here as
          they&apos;re built.
        </p>
      </div>
    </div>
  );
}
