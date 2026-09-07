"use client";

import type { DiffSpan } from "@/lib/types";

// Renders a redline span list inline. Color is signal, not decoration: mint
// means added, magenta means removed, per the design system's Signal
// Discipline Rule.
//
// Every span carries its index in the data attribute, which is how a mouse
// selection is turned back into a span range for comment anchoring. The spans
// stay plain text: the redline is a document to read, not a grid of buttons.
// Marks the span elements so a DOM Range can be resolved back to span indices.
export const SPAN_INDEX_ATTR = "data-span-index";

export function DiffView({
  spans,
  emptyCopy = "No differences.",
  highlight,
}: {
  spans: DiffSpan[];
  emptyCopy?: string;
  // Span range a comment is anchored to, shown while its comment is focused.
  highlight?: { start: number; end: number } | null;
}) {
  if (spans.length === 0) {
    return <p className="text-sm text-console-400">{emptyCopy}</p>;
  }

  return (
    <div className="kenoma-prose whitespace-pre-wrap break-words">
      {spans.map((span, i) => {
        const marked =
          !!highlight && i >= highlight.start && i <= highlight.end;
        const inner =
          span.op === "ins" ? (
            // Muted toward the surface rather than full-chroma: a long redline
            // is mostly marked text, and the saturated hue turned a document
            // into a neon wall. The hue still identifies the op; the shape
            // (fill for added, strike for removed) carries it at a glance.
            <ins className="bg-signal-info/8 text-signal-info/80 no-underline">
              {span.text}
            </ins>
          ) : span.op === "del" ? (
            <del className="bg-signal-error/8 text-signal-error/75 decoration-signal-error/40">
              {span.text}
            </del>
          ) : (
            <span>{span.text}</span>
          );
        return (
          <span
            key={i}
            {...{ [SPAN_INDEX_ATTR]: i }}
            className={
              marked
                ? "rounded-[2px] bg-console-600/70 decoration-console-300 underline decoration-dotted underline-offset-4"
                : undefined
            }
          >
            {inner}
          </span>
        );
      })}
    </div>
  );
}

// Resolves a comment anchor against the current span list. Positional only
// for now: the stored context_hash would let us detect drifted text, but the
// redline is recomputed from immutable revisions on every load, so an index
// out of range is the only realistic failure and it renders as "gone".
export function anchorStatus(
  spans: DiffSpan[],
  anchor: { op_index?: number; op_end_index?: number },
): "none" | "intact" | "gone" {
  const idx = anchor.op_index;
  if (idx === undefined) return "none";
  const span = spans[idx];
  if (!span) return "gone";
  return span.op === "del" ? "gone" : "intact";
}

// The passage an anchor covers, for quoting it back in the discussion.
export function anchorText(
  spans: DiffSpan[],
  anchor: { op_index?: number; op_end_index?: number },
): string {
  const start = anchor.op_index;
  if (start === undefined) return "";
  const end = Math.max(anchor.op_end_index ?? start, start);
  return spans
    .slice(start, end + 1)
    .map((s) => s.text)
    .join("");
}
