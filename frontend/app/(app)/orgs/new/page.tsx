"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { orgs as orgsApi, ApiError } from "@/lib/api";
import { useActiveOrg } from "@/lib/org-store";

export default function NewOrgPage() {
  const router = useRouter();
  const { refreshOrgs, setActiveOrgId } = useActiveOrg();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const org = await orgsApi.create(name);
      await refreshOrgs();
      setActiveOrgId(org.id);
      toast.success("Organization created");
      router.push(`/orgs/${org.id}`);
    } catch (err) {
      toast.error("Couldn't create organization", {
        description: err instanceof ApiError ? err.message : "Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/dashboard" className="mb-4 flex items-center gap-1.5 text-xs text-console-400 hover:text-signal-info transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to projects
      </Link>
      <h1 className="mb-6 font-heading text-xl font-semibold">New organization</h1>
      <div className="surface-panel p-gutter-lg">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-wide text-console-300">Organization name</span>
            <input
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-console-500 bg-console-900 px-3 py-2 text-console-50 placeholder:text-console-400 focus-console transition-shadow"
              placeholder="Acme Corp"
            />
            <span className="text-xs text-console-400">
              You'll automatically become the organization's admin.
            </span>
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="hover-lift press-scale rounded-md border border-signal-info/50 bg-signal-info/10 px-3 py-2 text-sm text-signal-info hover:bg-signal-info/20 transition-colors disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create organization"}
            </button>
            <Link href="/dashboard" className="text-sm text-console-400 hover:text-console-50 transition-colors">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
