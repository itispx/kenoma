"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveOrg } from "@/lib/org-store";

// GitHub-style context switcher: the user operates in exactly one active
// context (their personal space, or one org) at a time. Selecting a new
// context here is the only thing that changes X-Active-Org-Id going forward.
export function OrgSwitcher() {
  const { orgs, activeOrgId, activeOrg, setActiveOrgId, loading } = useActiveOrg();
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={loading}
        className="flex items-center gap-1.5 rounded-md border border-console-600 bg-console-800 px-2.5 py-1.5 text-sm text-console-50 hover:border-signal-info/50 focus-console transition-colors disabled:opacity-50"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-signal-info shadow-glow-info" />
        <span className="max-w-[10rem] truncate">{activeOrg ? activeOrg.name : "Personal"}</span>
        <ChevronDown className="h-3 w-3 text-console-400" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 border-console-600 bg-console-800/95 backdrop-blur-md text-console-50">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-widest text-console-400">
          Switch workspace
        </DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => {
            setActiveOrgId(null);
            router.push("/dashboard");
          }}
          className="flex items-center justify-between text-sm"
        >
          Personal
          {activeOrgId === null && <span className="text-signal-info">●</span>}
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-console-600" />
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => {
              setActiveOrgId(org.id);
              router.push("/dashboard");
            }}
            className="flex items-center justify-between text-sm"
          >
            <span className="truncate">{org.name}</span>
            {activeOrgId === org.id && <span className="text-signal-info">●</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator className="bg-console-600" />
        <DropdownMenuItem onClick={() => router.push("/orgs/new")} className="flex items-center gap-1.5 text-sm text-signal-info">
          <Plus className="h-3.5 w-3.5" />
          New organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
