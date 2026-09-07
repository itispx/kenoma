"use client";

import { useState } from "react";
import { ChevronRight, GitBranch, GitCommitHorizontal } from "lucide-react";

import type { ChangeLog, DiffSpan, Workstream, WorkstreamSummary } from "@/lib/types";
import { DiffView } from "@/components/diff-view";
import { LoadingState } from "@/components/page-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Main is a branch in the switcher even though it is not a workstream: it is
// where reading starts, and offering it as an option is what makes leaving a
// branch a move the user can name.
export const MAIN_BRANCH = "main";

const statusCopy: Record<WorkstreamSummary["status"], string> = {
  active: "active",
  submitted: "in review",
  abandoned: "abandoned",
};

export function BranchesPanel({
  branches,
  currentBranchId,
  currentBranch,
  localSlots,
  userId,
  canCreate,
  onSelect,
  onCreate,
  onEdit,
  logDiff,
  selectedLogId,
  onSelectLog,
}: {
  branches: WorkstreamSummary[] | null;
  currentBranchId: string | null;
  currentBranch: Workstream | null;
  localSlots: string[];
  userId: string | undefined;
  canCreate: boolean;
  onSelect: (branchId: string | null) => void;
  onCreate: () => void;
  onEdit: () => void;
  logDiff: DiffSpan[] | null;
  selectedLogId: string | null;
  onSelectLog: (log: ChangeLog) => void;
}) {
  const [open, setOpen] = useState(false);
  const summary = branches?.find((b) => b.id === currentBranchId) ?? null;
  const isOwner = !!summary && summary.owner_id === userId;
  const canEditHere = isOwner && summary?.status === "active";
  const label = summary?.name ?? MAIN_BRANCH;

  return (
    <section
      className="surface-panel mb-3 p-gutter"
      aria-label="Branches"
    >
      <div className="flex flex-wrap items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className="focus-console flex items-center gap-2 rounded-sm border border-console-600 px-2 py-1 text-xs text-console-100 hover:border-console-400">
                <GitBranch className="h-3.5 w-3.5 text-console-400" aria-hidden />
                <span className="font-mono">{label}</span>
                {summary && summary.status !== "active" && (
                  <span className="text-console-400">
                    {statusCopy[summary.status]}
                  </span>
                )}
              </button>
            }
          />
          <DropdownMenuContent align="start" className="min-w-64">
            {/* Base UI ties the label to its group via aria-labelledby, and
                GroupLabel throws outside a Group, so the label and the
                branches it names travel together. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-console-400">
                Branches
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onSelect(null)}>
                <GitBranch className="h-3.5 w-3.5 text-console-400" aria-hidden />
                <span className="font-mono">{MAIN_BRANCH}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-console-600" />
              {(branches ?? []).map((b) => (
                <DropdownMenuItem key={b.id} onClick={() => onSelect(b.id)}>
                  <GitBranch className="h-3.5 w-3.5 text-console-400" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-mono">{b.name}</span>
                  {/* A draft this browser holds exists nowhere else, so the
                      list says which branches carry one. */}
                  {localSlots.includes(b.id) && (
                    <span className="text-signal-warning">unsent draft</span>
                  )}
                  <span className="text-console-400">
                    {b.owner_id === userId ? "you" : b.owner_name}
                  </span>
                </DropdownMenuItem>
              ))}
              {branches?.length === 0 && (
                <DropdownMenuItem disabled>No branches yet</DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {summary && (
          <span className="text-xs text-console-400">
            {summary.owner_id === userId
              ? "Yours"
              : `${summary.owner_name}'s branch, read-only`}
            {" · "}
            {summary.change_log_count}{" "}
            {summary.change_log_count === 1 ? "Change Log" : "Change Logs"}
          </span>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-4">
          {canEditHere && (
            <button
              onClick={onEdit}
              className="focus-console rounded-sm border border-console-600 px-2 py-1 text-xs font-semibold whitespace-nowrap text-console-100 hover:border-console-400"
            >
              Open in editor
            </button>
          )}
          {canCreate && (
            <button
              onClick={onCreate}
              className="focus-console rounded-sm px-1 text-xs whitespace-nowrap text-console-300 underline-offset-4 hover:text-console-100 hover:underline"
            >
              New branch
            </button>
          )}
        </div>
      </div>

      {currentBranchId && (
        <div className="mt-3 border-t border-console-600/60 pt-3">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="branch-change-logs"
            className="focus-console -ml-1 flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-xs font-semibold text-console-100"
          >
            <ChevronRight
              className={`h-3.5 w-3.5 text-console-400 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
              aria-hidden
            />
            Change Logs
            <span className="font-mono font-normal text-console-400">
              {currentBranch?.change_logs.length ?? 0}
            </span>
          </button>
          {open &&
            (!currentBranch ? (
              <LoadingState label="Loading branch…" />
            ) : currentBranch.change_logs.length === 0 ? (
              <p className="mt-2 text-xs text-console-400">
                Nothing saved on this branch yet.
              </p>
            ) : (
              <ol id="branch-change-logs" className="mt-2 space-y-1">
                {currentBranch.change_logs.map((log) => (
                  <li key={log.id}>
                    <button
                      type="button"
                      onClick={() => onSelectLog(log)}
                      className={`row-hover focus-console flex w-full items-baseline gap-2 rounded-sm px-2 py-1.5 text-left text-xs ${
                        selectedLogId === log.id ? "bg-console-700/50" : ""
                      }`}
                    >
                      <GitCommitHorizontal
                        className="h-3.5 w-3.5 shrink-0 self-center text-console-400"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-console-200">
                        {log.message}
                      </span>
                      <span className="font-mono text-console-400">
                        #{log.seq}
                      </span>
                    </button>
                    {selectedLogId === log.id && (
                      <div className="mt-1 mb-2 ml-6 border-l border-console-600/60 pl-3">
                        {logDiff === null ? (
                          <LoadingState label="Computing redline…" />
                        ) : (
                          <DiffView
                            spans={logDiff}
                            emptyCopy="This checkpoint changed nothing."
                          />
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            ))}
        </div>
      )}
    </section>
  );
}
