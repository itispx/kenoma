"use client";

// The one way a document is shown when it is not being edited: main, a
// historical revision, a branch's latest checkpoint, a proposal's resolved
// snapshot. Before this existed each surface picked its own rendering, and a
// checkpoint shown as raw Markdown source next to a document shown as prose
// read as two different products.
//
// MarkdownIt runs with HTML disabled (same posture as the editor's parser), so
// raw markup in content can only ever render as text, never as markup.
import MarkdownIt from "markdown-it";

import { useMemo } from "react";

// Only these schemes are ever left clickable. Content is untrusted and
// `[x](javascript:...)` is valid Markdown; scheme-less relative paths are
// harmless since they resolve against our own origin.
const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);
function isSafeHref(href: string): boolean {
  const match = /^([a-z][a-z\d+.-]*:)/i.exec(href.trim());
  if (!match) return true;
  return SAFE_SCHEMES.has(match[1].toLowerCase());
}

const md = MarkdownIt("commonmark", {
  html: false,
  linkify: false,
  typographer: false,
}).enable("strikethrough");

md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  const token = tokens[idx];
  const href = token.attrGet("href") ?? "";
  if (!isSafeHref(href)) {
    // Inert text with a hint of styling beats a link that could act.
    token.attrs = token.attrs?.filter(([name]) => name !== "href") ?? null;
    token.attrJoin("class", "decoration-dotted");
  } else {
    token.attrSet("target", "_blank");
    token.attrSet("rel", "noopener noreferrer");
  }
  return self.renderToken(tokens, idx, options);
};

export function DocumentViewer({
  markdown,
  emptyCopy = "This document is empty.",
  className,
}: {
  markdown: string;
  emptyCopy?: string;
  className?: string;
}) {
  const html = useMemo(() => md.render(markdown ?? ""), [markdown]);
  if (!markdown?.trim()) {
    return <p className="text-sm text-console-400">{emptyCopy}</p>;
  }
  return (
    <div
      className={`kenoma-prose${className ? ` ${className}` : ""}`}
      // Rendered by a no-HTML pipeline; nothing in the string can be
      // attacker-controlled markup.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
