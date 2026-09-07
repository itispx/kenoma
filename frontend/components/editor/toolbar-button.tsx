"use client";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
export function ToolbarButton({
  icon: Icon,
  label,
  shortcut,
  active,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      // Without this the click blurs the editor first: the selection the
      // command was meant to act on is gone by the time it runs, and the blur
      // handler fires a save nobody asked for.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-keyshortcuts={shortcut}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        "focus-console press-scale flex h-8 w-8 items-center justify-center rounded-sm",
        "border border-transparent text-console-300 transition-colors",
        "hover:bg-console-700/60 hover:text-console-50",
        "disabled:pointer-events-none disabled:opacity-40",
        // Fill and glyph, no border: several marks can be active at once, and
        // stacking a ring on top of the tint made a formatted paragraph light
        // up a row of mint chips.
        active && "bg-signal-info/10 text-signal-info",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}
export function ToolbarSeparator() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-console-600" />;
}
