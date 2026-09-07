"use client";
import type { SaveStatus } from "@/lib/save-status";
// The badge reports the local branch's persistence, not intent: "Saved" only
// appears once IndexedDB has confirmed the write.
const copy: Record<SaveStatus, { label: string; className: string } | null> = {
  idle: null,
  dirty: { label: "Unsaved", className: "text-console-400" },
  // Muted, not lime: an autosaving editor sits in "saved" almost all the time,
  // and a hue that is always on stops reading as a signal. Only "Not saved"
  // needs to catch the eye.
  saved: { label: "Saved", className: "text-console-400" },
  error: { label: "Not saved", className: "text-signal-error" },
};
export function SaveBadge({
  status,
  local = false,
}: {
  status: SaveStatus;
  local?: boolean;
}) {
  const state = copy[status];
  const label = state?.label === "Saved" && local ? "Saved locally" : state?.label;
  return (
    <span
      role="status"
      aria-live="polite"
      // The slot keeps its width whether or not there is a label, so the title
      // beside it never shifts as the status changes.
      className="inline-flex min-w-20 items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide"
    >
      {state && (
        <>
          <span aria-hidden className={`h-1.5 w-1.5 rounded-[4px] bg-current ${state.className}`} />
          <span className={state.className}>{label}</span>
        </>
      )}
    </span>
  );
}
