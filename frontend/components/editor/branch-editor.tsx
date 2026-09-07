"use client";
import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  EllipsisVertical,
  GitCommitHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { editorExtensions } from "@/lib/editor-extensions";
import {
  normalizeMarkdown,
  parseMarkdown,
  serializeMarkdown,
} from "@/lib/markdown";
import type { SaveStatus } from "@/lib/save-status";
import type { LocalBranch } from "@/lib/local-branch";
import type { ChangeLog } from "@/lib/types";
import { inputClass, primaryBtn } from "@/components/auth-shell";
import { SaveBadge } from "./save-badge";
import { EditorToolbar } from "./editor-toolbar";
import { LinkDialog } from "./link-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Only these schemes are ever handed to window.open. Document content can
// arrive from pasted or imported Markdown, and `[text](javascript:...)` is
// valid Markdown, so the scheme is checked here rather than trusted.
function isSafeHref(href: string): boolean {
  try {
    const { protocol } = new URL(href, window.location.origin);
    return ["http:", "https:", "mailto:", "tel:"].includes(protocol);
  } catch {
    return false;
  }
}

export function BranchEditor({
  branch,
  branchName,
  saveStatus,
  canSubmitReview,
  onPatch,
  onBack,
  onDiscard,
  onOpenChangeRequest,
  mode = "branch",
  onSaveInitialVersion,
  conflictNotice,
  changeLogs = [],
  hasUnloggedChanges = false,
  onSaveChangeLog,
  onResolveConflict,
}: {
  branch: LocalBranch;
  branchName?: string;
  saveStatus: SaveStatus;
  canSubmitReview: boolean;
  onPatch: (patch: { title?: string; content_markdown?: string }) => void;
  onBack: () => void;
  onDiscard: () => void | Promise<void>;
  onOpenChangeRequest: () => Promise<void>;
  mode?: "initial" | "branch";
  onSaveInitialVersion?: () => Promise<void>;
  conflictNotice?: string | null;
  changeLogs?: ChangeLog[];
  hasUnloggedChanges?: boolean;
  onSaveChangeLog?: (message: string) => Promise<void>;
  onResolveConflict?: () => void | Promise<void>;
}) {
  const [title, setTitle] = useState(branch.title);
  const [opening, setOpening] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [hasContent, setHasContent] = useState(
    () => normalizeMarkdown(branch.content_markdown).trim().length > 0,
  );
  // Folded away by default: the editing view opens on the document, and the
  // header line already reports how many logs are behind it.
  const [logsOpen, setLogsOpen] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [logMessage, setLogMessage] = useState("");
  const [savingLog, setSavingLog] = useState(false);
  // Captured when the dialog opens. The dialog is modal, so by the time a
  // href comes back the editor has lost focus and the live selection can no
  // longer be trusted to be what the user had highlighted.
  const linkTarget = useRef<{
    from: number;
    to: number;
    insideLink: boolean;
  } | null>(null);
  // What this branch currently holds, expressed the way this editor writes
  // it. Serializing normalizes, so comparing against the raw stored string
  // would flag an untouched branch as edited on its first idle second.
  const baseline = useRef(normalizeMarkdown(branch.content_markdown));

  const editor = useEditor({
    extensions: editorExtensions,
    // Passed as initial content rather than set afterwards, since setContent
    // fires an update and that update would look like the user's first edit.
    content: parseMarkdown(branch.content_markdown).toJSON(),
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editable: true,
    editorProps: {
      attributes: {
        class: "kenoma-prose focus:outline-none",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Branch draft",
      },
      handleClick(_view, _pos, event) {
        if (!event.ctrlKey && !event.metaKey) return false;
        const anchor = (event.target as HTMLElement | null)?.closest("a");
        const href = anchor?.getAttribute("href");
        if (!href || !isSafeHref(href)) return false;
        window.open(href, "_blank", "noopener,noreferrer");
        return true;
      },
    },
    onUpdate: ({ editor: e }) => {
      let markdown: string;
      try {
        markdown = serializeMarkdown(e.state.doc);
      } catch {
        // The serializer runs in strict mode, so this means the document holds
        // a node Markdown cannot express. Saying so beats saving a draft with
        // a hole in it.
        toast.error("This content cannot be saved as Markdown.");
        return;
      }
      if (markdown === baseline.current) return;
      baseline.current = markdown;
      setHasContent(markdown.trim().length > 0);
      onPatch({ content_markdown: markdown });
    },
    onBlur: () => {
      if (mode !== "initial") return;
      onPatch({ title: title.trim() || branch.title });
    },
  });

  // The name is settled when the first version is saved. After that a branch
  // proposes body changes only, so a Change Request can never carry a rename
  // a reviewer would have to notice in a redline that does not show it.
  const commitTitle = useCallback(() => {
    if (mode !== "initial") return;
    const trimmed = title.trim();
    if (!trimmed || trimmed === branch.title) return;
    onPatch({ title: trimmed });
  }, [mode, title, branch.title, onPatch]);

  // One source of truth for both the inline buttons and the kebab that stands
  // in for them on a narrow row.
  const logDisabled = !hasUnloggedChanges || !!conflictNotice;
  const changeRequestDisabled =
    opening ||
    !canSubmitReview ||
    hasUnloggedChanges ||
    changeLogs.length === 0 ||
    !!conflictNotice;

  function openLinkDialog() {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    linkTarget.current = { from, to, insideLink: editor.isActive("link") };
    setLinkOpen(true);
  }

  function applyLink(raw: string) {
    if (!editor) return;
    // A bare "example.com" is not a URI, and the Link extension validates what
    // it is given, so an unschemed address would be silently dropped.
    const href = /^([a-z][a-z\d+.-]*:|\/\/)/i.test(raw.trim())
      ? raw.trim()
      : `https://${raw.trim()}`;
    const target = linkTarget.current ?? {
      from: editor.state.selection.from,
      to: editor.state.selection.to,
      insideLink: editor.isActive("link"),
    };
    const chain = editor
      .chain()
      .focus()
      .setTextSelection({ from: target.from, to: target.to });
    if (target.from !== target.to) {
      chain.setLink({ href }).run();
    } else if (target.insideLink) {
      chain.extendMarkRange("link").setLink({ href }).run();
    } else {
      chain
        .insertContent({
          type: "text",
          text: href,
          marks: [{ type: "link", attrs: { href } }],
        })
        .run();
    }
    linkTarget.current = null;
  }

  return (
    <div>
      {/* One row, hairline-ruled rather than boxed: the title (or its heading)
          and every action that acts on this branch sit on the same line, so
          the editing view opens with the document instead of with chrome. */}
      <div className="mb-2 border-b border-console-600/60 pb-gutter">
        {/* No wrapping: the title yields (it truncates) so the actions never
            drop onto a second line. */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to main, keeping this branch"
            className="focus-console flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-console-400 hover:text-console-100"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </button>
          {mode === "initial" ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                commitTitle();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              aria-label="Document title"
              className={`${inputClass} min-w-40 flex-1 border-transparent bg-transparent px-2 text-base font-semibold hover:border-console-600`}
            />
          ) : (
            <h1 className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="min-w-0 truncate text-base font-semibold">
                {branch.title}
              </span>
              {branchName && (
                <span className="shrink-0 rounded-[4px] border border-console-600 px-1.5 py-0.5 font-mono text-[11px] tracking-wide text-console-300">
                  {branchName}
                </span>
              )}
            </h1>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-5">
            {mode === "initial" ? (
              <button
                type="button"
                disabled={opening || !title.trim() || !hasContent}
                onClick={() => {
                  commitTitle();
                  setOpening(true);
                  void (onSaveInitialVersion?.() ?? Promise.resolve()).finally(
                    () => setOpening(false),
                  );
                }}
                className={`${primaryBtn} whitespace-nowrap`}
              >
                {opening ? "Saving…" : "Save"}
              </button>
            ) : (
              // Below the breakpoint these three collapse into the kebab past
              // the save status, so the row never wraps the document's own
              // title onto a second line.
              <div className="hidden items-center gap-5 md:flex">
                <button
                  type="button"
                  onClick={() => void onDiscard()}
                  className="focus-console rounded-sm px-1 text-xs whitespace-nowrap text-console-300 underline-offset-4 hover:text-console-100 hover:underline"
                >
                  Discard
                </button>
                <button
                  type="button"
                  disabled={logDisabled}
                  onClick={() => setLogDialogOpen(true)}
                  className="focus-console rounded-sm border border-console-600 px-3 py-2 text-xs font-semibold whitespace-nowrap text-console-100 hover:border-console-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Save Log
                </button>
                <button
                  type="button"
                  disabled={changeRequestDisabled}
                  title={
                    !canSubmitReview
                      ? "Requires the docs:submit_review permission"
                      : undefined
                  }
                  onClick={() => {
                    setOpening(true);
                    void onOpenChangeRequest().finally(() => setOpening(false));
                  }}
                  className={`${primaryBtn} whitespace-nowrap`}
                >
                  {opening ? "Preparing…" : "Create Change Request"}
                </button>
              </div>
            )}
            {/* Rides with the actions rather than the title: the status answers
              "is what I just typed safe", which is the same question the
              buttons beside it act on. */}
            <SaveBadge status={saveStatus} local />
            {mode === "branch" && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      aria-label="Branch actions"
                      className="focus-console flex h-8 w-8 items-center justify-center rounded-sm text-console-400 hover:text-console-100 md:hidden"
                    >
                      <EllipsisVertical className="h-4 w-4" aria-hidden />
                    </button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={changeRequestDisabled}
                    onClick={() => {
                      setOpening(true);
                      void onOpenChangeRequest().finally(() =>
                        setOpening(false),
                      );
                    }}
                  >
                    Create Change Request
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={logDisabled}
                    onClick={() => setLogDialogOpen(true)}
                  >
                    Save Log
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => void onDiscard()}
                  >
                    Discard
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-console-300">
          {mode === "initial"
            ? "Initial draft, stored only in this browser until you Save."
            : "Edits stay in this browser until you save a Change Log. Main stays untouched until a Change Request merges."}
        </p>
      </div>

      {conflictNotice && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-signal-warning/40 bg-signal-warning/10 px-gutter py-3 text-xs text-console-200">
          <span>{conflictNotice}</span>
          {onResolveConflict && (
            <button
              type="button"
              onClick={() => void onResolveConflict()}
              className="focus-console rounded-sm px-2 py-1 font-semibold text-signal-warning underline-offset-4 hover:underline"
            >
              Reconcile with latest log
            </button>
          )}
        </div>
      )}

      {/* Only once there is something to list. An empty panel explaining what
          a Change Log is spent a permanent block of the page on advice the
          Save Change Log button already implies. */}
      {mode === "branch" && changeLogs.length > 0 && (
        <section
          className="surface-panel mb-2 p-gutter"
          aria-label="Saved Change Logs"
        >
          <div
            className={`flex items-center justify-between gap-3 ${logsOpen ? "mb-2" : ""}`}
          >
            <h2>
              <button
                type="button"
                onClick={() => setLogsOpen((open) => !open)}
                aria-expanded={logsOpen}
                aria-controls="change-log-list"
                className="focus-console -ml-1 flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-xs font-semibold text-console-100"
              >
                <ChevronRight
                  className={`h-3.5 w-3.5 text-console-400 transition-transform duration-150 ${logsOpen ? "rotate-90" : ""}`}
                  aria-hidden
                />
                Change Logs
                {/* The count is the one thing the collapsed row still has to
                    carry: it says how much is folded away. */}
                <span className="font-mono font-normal text-console-400">
                  {changeLogs.length}
                </span>
              </button>
            </h2>
            {/* Only the pending state carries a hue. "All changes logged" is
                the resting state, and a permanent green line teaches the eye
                to ignore color exactly where it has to mean something. */}
            <span
              className={`text-xs ${hasUnloggedChanges ? "text-signal-warning" : "text-console-400"}`}
            >
              {hasUnloggedChanges ? "Unlogged changes" : "All changes logged"}
            </span>
          </div>
          <ol id="change-log-list" hidden={!logsOpen} className="space-y-2">
            {changeLogs.map((log) => (
              <li key={log.id} className="flex items-start gap-2 text-xs">
                <GitCommitHorizontal
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-console-400"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 text-console-200">
                  {log.message}
                </span>
                <span className="font-mono text-console-400">#{log.seq}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {editor && (
        <>
          <EditorToolbar
            editor={editor}
            disabled={false}
            onEditLink={openLinkDialog}
          />
          {linkOpen && (
            <LinkDialog
              open
              initialHref={editor.getAttributes("link").href ?? ""}
              onOpenChange={setLinkOpen}
              onSubmit={applyLink}
            />
          )}
        </>
      )}
      <div className="surface-panel p-gutter-lg">
        <EditorContent editor={editor} />
      </div>

      <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Change Log</DialogTitle>
            <DialogDescription>
              Describe this checkpoint. The document snapshot becomes immutable
              after saving.
            </DialogDescription>
          </DialogHeader>
          <label
            htmlFor="change-log-message"
            className="text-xs text-console-300"
          >
            Summary
          </label>
          <input
            id="change-log-message"
            autoFocus
            maxLength={200}
            value={logMessage}
            onChange={(event) => setLogMessage(event.target.value)}
            placeholder="Summarize this change"
            className={`${inputClass} w-full`}
          />
          <div className="text-right text-xs text-console-400">
            {logMessage.length}/200
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setLogDialogOpen(false)}
              className="focus-console rounded-sm px-2 py-1 text-xs text-console-300 hover:text-console-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={savingLog || !logMessage.trim()}
              className={`${primaryBtn} w-auto`}
              onClick={() => {
                setSavingLog(true);
                void (onSaveChangeLog?.(logMessage.trim()) ?? Promise.resolve())
                  .then(() => {
                    setLogMessage("");
                    setLogDialogOpen(false);
                  })
                  .finally(() => setSavingLog(false));
              }}
            >
              {savingLog ? "Saving…" : "Save Change Log"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
