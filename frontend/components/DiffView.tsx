"use client";

import type { DiffOp } from "@/lib/types";

// Renders the diff as inline ins/del spans over the raw Markdown source
// (word/phrase-level, from go-diff's semantic-cleanup pass) rather than
// re-rendering as rich HTML. A rich-rendered redline would need to slice
// Markdown at diff-op boundaries that don't always align with Markdown
// syntax boundaries (e.g. splitting "**bold**" mid-token), which risks
// silently corrupting the rendering — this is the correctness-first choice.
export function DiffView({
  ops,
  selectedIndex,
  onSelect,
}: {
  ops: DiffOp[];
  selectedIndex?: number | null;
  onSelect?: (index: number) => void;
}) {
  return (
    <div className="kenoma-diff surface-panel whitespace-pre-wrap p-gutter text-sm leading-relaxed text-console-100">
      {ops.map((op, i) => {
        const clickable = !!onSelect;
        const selected = selectedIndex === i;
        const base = clickable ? "cursor-pointer" : "";
        const ring = selected ? "shadow-glow-info ring-1 ring-signal-info" : "";
        if (op.type === "insert") {
          return (
            <ins
              key={i}
              onClick={() => onSelect?.(i)}
              className={`rounded-sm no-underline ${base} ${ring}`}
            >
              {op.text}
            </ins>
          );
        }
        if (op.type === "delete") {
          return (
            <del
              key={i}
              onClick={() => onSelect?.(i)}
              className={`rounded-sm ${base} ${ring}`}
            >
              {op.text}
            </del>
          );
        }
        return (
          <span key={i} onClick={() => onSelect?.(i)} className={`rounded-sm ${base} ${ring}`}>
            {op.text}
          </span>
        );
      })}
    </div>
  );
}
