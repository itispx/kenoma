import type { RevisionStatus } from "@/lib/types";

const STATUS: Record<RevisionStatus, { label: string; color: string; glow: string; glyph: string }> = {
  draft: { label: "draft", color: "text-console-300", glow: "", glyph: "○" },
  in_review: { label: "in review", color: "text-signal-warning", glow: "text-glow-warning", glyph: "◐" },
  approved: { label: "approved", color: "text-signal-success", glow: "text-glow-success", glyph: "●" },
  rejected: { label: "rejected", color: "text-signal-error", glow: "text-glow-error", glyph: "✕" },
};

export function StatusBadge({
  status,
  withGlow = false,
  className = "",
}: {
  status: RevisionStatus;
  withGlow?: boolean;
  className?: string;
}) {
  const s = STATUS[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs uppercase tracking-widest ${s.color} ${withGlow ? s.glow : ""} ${className}`}
    >
      <span aria-hidden>{s.glyph}</span>
      {s.label}
    </span>
  );
}
