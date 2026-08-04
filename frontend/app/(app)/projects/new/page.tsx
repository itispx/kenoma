"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { projects as projectsApi, ApiError } from "@/lib/api";
import { useActiveOrg } from "@/lib/org-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PERSONAL_VALUE = "__personal__";

function OwnerOption({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-md border px-3 py-2 text-left text-sm transition-all ${
        selected
          ? "border-signal-info/60 bg-signal-info/10 text-signal-info shadow-glow-info"
          : "border-console-600 text-console-300 hover:border-console-500"
      }`}
    >
      {label}
    </button>
  );
}

function OwnerOrgPicker({
  orgs,
  value,
  active,
  onSelect,
}: {
  orgs: { id: string; name: string }[];
  value: string;
  active: boolean;
  onSelect: (orgId: string) => void;
}) {
  const selected = orgs.find((org) => org.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-all focus-console ${
          active
            ? "border-signal-info/60 bg-signal-info/10 text-signal-info shadow-glow-info"
            : "border-console-600 text-console-300 hover:border-console-500"
        }`}
      >
        <span className="truncate">{selected ? selected.name : "Choose organization…"}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 border-console-600 bg-console-800/95 backdrop-blur-md text-console-50">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-widest text-console-400">
          Organizations
        </DropdownMenuLabel>
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => onSelect(org.id)}
            className="flex items-center justify-between text-sm"
          >
            <span className="truncate">{org.name}</span>
            {value === org.id && <span className="text-signal-info">●</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function NewProjectPage() {
  const router = useRouter();
  const { orgs, activeOrgId } = useActiveOrg();
  const [name, setName] = useState("");
  const [owner, setOwner] = useState(activeOrgId ?? PERSONAL_VALUE);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const project = await projectsApi.create(name, owner === PERSONAL_VALUE ? null : owner);
      router.push(`/projects/${project.id}`);
    } catch (err) {
      toast.error("Couldn't create project", { description: err instanceof ApiError ? err.message : undefined });
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
      <h1 className="mb-6 font-heading text-xl font-semibold">New project</h1>
      <div className="surface-panel p-gutter-lg">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wide text-console-300">Owner</span>
            {orgs.length > 1 ? (
              <div className="grid grid-cols-2 gap-2">
                <OwnerOption
                  label="Personal"
                  selected={owner === PERSONAL_VALUE}
                  onSelect={() => setOwner(PERSONAL_VALUE)}
                />
                <OwnerOrgPicker
                  orgs={orgs}
                  value={owner === PERSONAL_VALUE ? "" : owner}
                  active={owner !== PERSONAL_VALUE}
                  onSelect={(orgId) => setOwner(orgId)}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <OwnerOption label="Personal" selected={owner === PERSONAL_VALUE} onSelect={() => setOwner(PERSONAL_VALUE)} />
                {orgs.map((org) => (
                  <OwnerOption key={org.id} label={org.name} selected={owner === org.id} onSelect={() => setOwner(org.id)} />
                ))}
              </div>
            )}
          </fieldset>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-wide text-console-300">Project name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-console-500 bg-console-900 px-3 py-2 text-console-50 placeholder:text-console-400 focus-console transition-shadow"
              placeholder="Employee Handbook"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="hover-lift press-scale rounded-md border border-signal-info/50 bg-signal-info/10 px-3 py-2 text-sm text-signal-info hover:bg-signal-info/20 transition-colors disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create project"}
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
