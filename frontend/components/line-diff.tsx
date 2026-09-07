"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { MessageSquarePlus } from "lucide-react";

import type { DiffSpan } from "@/lib/types";

// A line-oriented redline, read the way a code review is read: one column,
// removed lines then added lines, numbered on both sides, with untouched
// stretches folded away.
//
// The server still speaks in word-level spans, and that is deliberate: the
// spans are what let a changed line keep its intra-line marks instead of
// lighting up whole lines that differ by one word. Lines are derived from them
// here, which also means a comment anchor stays exactly what the server can
// verify: the span range a line covers.

type Op = DiffSpan["op"];

interface Seg {
  op: Op;
  text: string;
  spanIndex: number;
}

// Marks a rendered segment with the span it came from, so a mouse selection
// can be resolved back to the span range it covers.
const SPAN_INDEX_ATTR = "data-span-index";

export interface DiffRow {
  kind: Op;
  segs: Seg[];
  baseNo: number | null;
  targetNo: number | null;
  spanStart: number;
  spanEnd: number;
  text: string;
}

// Lines are cut out of the span stream: a span can carry several newlines, and
// a line can be assembled from several spans.
function toRows(spans: DiffSpan[]): DiffRow[] {
  const raw: Seg[][] = [[]];
  spans.forEach((span, index) => {
    const parts = span.text.split("\n");
    parts.forEach((text, partIndex) => {
      if (partIndex > 0) raw.push([]);
      raw[raw.length - 1].push({ op: span.op, text, spanIndex: index });
    });
  });

  const rows: DiffRow[] = [];
  let baseNo = 0;
  let targetNo = 0;
  for (const segs of raw) {
    // Zero-length segments are the seams between spans, not content. Judging
    // a line by them would invent an empty removed line every time an
    // insertion happened to start one.
    const meaningful = segs.filter((s) => s.text.length > 0);
    const judged = meaningful.length > 0 ? meaningful : segs;
    const hasIns = judged.some((s) => s.op === "ins");
    const hasDel = judged.some((s) => s.op === "del");
    const inBase = judged.some((s) => s.op !== "ins");
    const inTarget = judged.some((s) => s.op !== "del");
    const spanStart = segs.length > 0 ? segs[0].spanIndex : 0;
    const spanEnd = segs.length > 0 ? segs[segs.length - 1].spanIndex : 0;

    if (!hasIns && !hasDel) {
      baseNo += 1;
      targetNo += 1;
      rows.push({
        kind: "plain",
        segs,
        baseNo,
        targetNo,
        spanStart,
        spanEnd,
        text: segs.map((s) => s.text).join(""),
      });
      continue;
    }
    if (inBase) {
      const side = segs.filter((s) => s.op !== "ins");
      baseNo += 1;
      rows.push({
        kind: "del",
        segs: side,
        baseNo,
        targetNo: null,
        spanStart,
        spanEnd,
        text: side.map((s) => s.text).join(""),
      });
    }
    if (inTarget) {
      const side = segs.filter((s) => s.op !== "del");
      targetNo += 1;
      rows.push({
        kind: "ins",
        segs: side,
        baseNo: null,
        targetNo,
        spanStart,
        spanEnd,
        text: side.map((s) => s.text).join(""),
      });
    }
  }
  // A document ending in a newline leaves a trailing empty row that exists in
  // neither side's reading.
  const last = rows[rows.length - 1];
  if (last && last.kind === "plain" && last.text === "") rows.pop();
  return rows;
}

const CONTEXT = 3;

interface Block {
  kind: "rows" | "fold";
  rows: DiffRow[];
  from: number;
}

// Unchanged runs fold, keeping CONTEXT lines of each side visible the way a
// hunk header does. Context is counted in lines that carry text: Markdown
// separates paragraphs with blank lines, so counting rows would spend the
// whole window on the blanks either side of a change and show one real line.
function toBlocks(rows: DiffRow[]): Block[] {
  const keep = new Set<number>();
  const walk = (from: number, step: -1 | 1) => {
    let seen = 0;
    for (let j = from + step; j >= 0 && j < rows.length; j += step) {
      if (rows[j].kind !== "plain") break;
      keep.add(j);
      if (rows[j].text.trim().length > 0) {
        seen += 1;
        if (seen === CONTEXT) return;
      }
    }
  };
  rows.forEach((row, i) => {
    if (row.kind === "plain") return;
    keep.add(i);
    walk(i, -1);
    walk(i, 1);
  });
  const blocks: Block[] = [];
  let current: Block | null = null;
  rows.forEach((row, i) => {
    const kind: Block["kind"] = keep.has(i) ? "rows" : "fold";
    if (!current || current.kind !== kind) {
      current = { kind, rows: [row], from: i };
      blocks.push(current);
    } else {
      current.rows.push(row);
    }
  });
  return blocks;
}

const rowTone: Record<Op, string> = {
  plain: "",
  ins: "bg-signal-info/8",
  del: "bg-signal-error/8",
};

const markTone: Record<Op, string> = {
  plain: "",
  ins: "bg-signal-info/20 text-signal-info",
  del: "bg-signal-error/20 text-signal-error/90",
};

const sign: Record<Op, string> = { plain: " ", ins: "+", del: "-" };

export function LineDiff({
  spans,
  emptyCopy = "No differences.",
  highlight,
  onCommentLine,
  onCommentRange,
  showAll = false,
}: {
  spans: DiffSpan[];
  emptyCopy?: string;
  // Renders every line, folding nothing: the whole document with its changes
  // marked in place, rather than the changes with a little context.
  showAll?: boolean;
  // Span range a pending or focused comment is anchored to.
  highlight?: { start: number; end: number } | null;
  onCommentLine?: (row: DiffRow) => void;
  // Commenting on a phrase rather than a whole line: the reviewer selects
  // text and a Comment affordance follows the selection.
  onCommentRange?: (range: {
    start: number;
    end: number;
    quote: string;
  }) => void;
}) {
  const rows = useMemo(() => toRows(spans), [spans]);
  const blocks = useMemo(
    () => (showAll ? [{ kind: "rows" as const, rows, from: 0 }] : toBlocks(rows)),
    [rows, showAll],
  );
  const [unfolded, setUnfolded] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectionUi, setSelectionUi] = useState<{
    top: number;
    left: number;
    start: number;
    end: number;
    quote: string;
  } | null>(null);

  // Resolves the live DOM selection back to the span range it covers. A
  // selection that lands outside the redline, or that covers nothing but
  // whitespace, clears the affordance rather than anchoring to a passage the
  // reviewer did not point at.
  const readSelection = useCallback(() => {
    const container = containerRef.current;
    const selection = window.getSelection();
    if (
      !container ||
      !selection ||
      selection.isCollapsed ||
      selection.rangeCount === 0
    ) {
      setSelectionUi(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      setSelectionUi(null);
      return;
    }
    const spanIndex = (node: Node | null): number | null => {
      const element =
        node?.nodeType === Node.ELEMENT_NODE
          ? (node as Element)
          : (node?.parentElement ?? null);
      const raw = element
        ?.closest(`[${SPAN_INDEX_ATTR}]`)
        ?.getAttribute(SPAN_INDEX_ATTR);
      return raw === null || raw === undefined ? null : Number(raw);
    };
    const first = spanIndex(range.startContainer);
    const last = spanIndex(range.endContainer);
    const quote = selection.toString();
    if (first === null || last === null || !quote.trim()) {
      setSelectionUi(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    const box = container.getBoundingClientRect();
    setSelectionUi({
      top: rect.top - box.top + container.scrollTop - 6,
      left: rect.left - box.left + container.scrollLeft,
      start: Math.min(first, last),
      end: Math.max(first, last),
      quote,
    });
  }, []);

  if (spans.length === 0 || rows.length === 0) {
    return <p className="text-sm text-console-400">{emptyCopy}</p>;
  }

  return (
    <div
      ref={containerRef}
      onMouseUp={onCommentRange ? readSelection : undefined}
      className="relative overflow-x-auto font-mono text-xs leading-5"
    >
      {/* Follows the selection: the reviewer's attention is on the passage
          they just highlighted, and that passage is the anchor. */}
      {onCommentRange && selectionUi && (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onCommentRange({
              start: selectionUi.start,
              end: selectionUi.end,
              quote: selectionUi.quote,
            });
            setSelectionUi(null);
            window.getSelection()?.removeAllRanges();
          }}
          style={{ top: selectionUi.top, left: selectionUi.left }}
          className="focus-console absolute z-10 -translate-y-full rounded-sm border border-console-500 bg-console-800 px-2 py-1 text-xs font-semibold whitespace-nowrap text-console-100 shadow-panel hover:border-console-400"
        >
          Comment
        </button>
      )}
      {blocks.map((block) => {
        if (block.kind === "fold" && !unfolded.has(block.from)) {
          return (
            <button
              key={`fold-${block.from}`}
              type="button"
              onClick={() =>
                setUnfolded((open) => new Set(open).add(block.from))
              }
              className="row-hover focus-console flex w-full items-center gap-2 border-y border-console-600/60 bg-console-900 px-2 py-1 text-left text-console-400 hover:text-console-100"
            >
              <span className="w-20 shrink-0 text-right">⋯</span>
              <span>
                {block.rows.length} unchanged{" "}
                {block.rows.length === 1 ? "line" : "lines"}
              </span>
            </button>
          );
        }
        return (
          <div key={`rows-${block.from}`}>
            {block.rows.map((row, i) => {
              const marked =
                !!highlight &&
                row.spanStart <= highlight.end &&
                row.spanEnd >= highlight.start;
              return (
                <div
                  key={`${block.from}-${i}`}
                  className={`group relative flex items-start ${rowTone[row.kind]} ${
                    marked ? "ring-1 ring-console-400/60 ring-inset" : ""
                  }`}
                >
                  <span
                    aria-hidden
                    className="w-10 shrink-0 select-none pr-2 text-right text-console-500"
                  >
                    {row.baseNo ?? ""}
                  </span>
                  <span
                    aria-hidden
                    className="w-10 shrink-0 select-none pr-2 text-right text-console-500"
                  >
                    {row.targetNo ?? ""}
                  </span>
                  {onCommentLine ? (
                    <button
                      type="button"
                      title="Comment on this line"
                      aria-label={`Comment on line ${row.targetNo ?? row.baseNo ?? ""}`}
                      onClick={() => onCommentLine(row)}
                      className="focus-console mr-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] text-console-500 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-console-100"
                    >
                      <MessageSquarePlus className="h-3 w-3" aria-hidden />
                    </button>
                  ) : (
                    <span aria-hidden className="mr-1 w-4 shrink-0" />
                  )}
                  <span
                    aria-hidden
                    className={`w-3 shrink-0 select-none ${
                      row.kind === "ins"
                        ? "text-signal-info"
                        : row.kind === "del"
                          ? "text-signal-error"
                          : "text-console-600"
                    }`}
                  >
                    {sign[row.kind]}
                  </span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-console-100">
                    {row.segs.map((seg, s) =>
                      seg.text.length === 0 ? null : (
                        <span
                          key={s}
                          {...{ [SPAN_INDEX_ATTR]: seg.spanIndex }}
                          className={
                            seg.op === "plain"
                              ? undefined
                              : `rounded-[2px] ${markTone[seg.op]}`
                          }
                        >
                          {seg.text}
                        </span>
                      ),
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
