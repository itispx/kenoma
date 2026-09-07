import type { ChangeRequestStatus } from "@/lib/types";

const styles: Record<
  ChangeRequestStatus,
  { label: string; className: string }
> = {
  open: { label: "Open", className: "border-signal-warning/60 text-signal-warning" },
  merged: { label: "Merged", className: "border-signal-success/60 text-signal-success" },
  closed: { label: "Closed", className: "border-console-600 text-console-300" },
};

// The badge's hue is its message; the label is always explicit wording.
export function CrStatusBadge({ status }: { status: ChangeRequestStatus }) {
  const style = styles[status];
  return (
    <span
      className={`inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium tracking-wide ${style.className}`}
    >
      {style.label}
    </span>
  );
}
