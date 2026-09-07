"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { orgs } from "@/lib/api";
import type { Organization } from "@/lib/types";
import { OrgIcon } from "@/components/org-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
export function OrgSwitcher() {
  const [items, setItems] = useState<Organization[]>([]);
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    orgs
      .list()
      .then(setItems)
      .catch(() => setItems([]));
  }, [pathname]);
  const currentId = pathname.match(/^\/orgs\/([^/]+)/)?.[1];
  const current = items.find((o) => o.id === currentId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="focus-console flex max-w-52 items-center gap-2 rounded-lg border border-console-600 px-3 py-1.5 text-sm">
        <OrgIcon
          isPersonal={!!current?.is_personal}
          className="h-4 w-4 text-signal-info"
        />
        <span className="truncate">
          {current
            ? current.is_personal
              ? "Personal"
              : current.name
            : "Workspaces"}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-console-400" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="surface-panel min-w-56 border-console-600 bg-console-800 p-1"
        align="start"
      >
        {/* Base UI ties the label to its group via aria-labelledby, and GroupLabel
        throws outside a Group — so the label and the org list travel together. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-console-400">
            Your workspaces
          </DropdownMenuLabel>
          {items.map((o) => (
            <DropdownMenuItem
              key={o.id}
              onClick={() => router.push(`/orgs/${o.id}/projects`)}
              className="row-hover focus:bg-console-700 focus:text-console-50"
            >
              <OrgIcon
                isPersonal={o.is_personal}
                className="h-4 w-4 text-console-400"
              />
              {o.is_personal ? "Personal" : o.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="bg-console-600" />
        <DropdownMenuItem
          render={<Link href="/orgs/new" />}
          className="row-hover focus:bg-console-700 focus:text-console-50"
        >
          <Plus />
          Create organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
