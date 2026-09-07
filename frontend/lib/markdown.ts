// Markdown is the only persisted form of a document, so this module is the
// contract between the editor's schema and what lands in the database. It is
// built from explicit specs rather than a generic converter: the schema is
// small and fixed, and knowing exactly what each node serializes to is what
// keeps a round trip from quietly rewriting someone's document.
//
// Round tripping normalizes rather than preserving: _x_ becomes *x*, "*" bullets
// become "-", single newlines inside a paragraph collapse to spaces, and
// indented code becomes fenced. That is why the autosave baseline is the
// normalized form of what was loaded, never the loaded string itself.
import { getSchema } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import MarkdownIt from "markdown-it";
import {
  MarkdownParser,
  MarkdownSerializer,
  defaultMarkdownSerializer,
} from "prosemirror-markdown";

import { editorExtensions } from "./editor-extensions";

// Derived from the extension list rather than from a live editor, so parsing
// works before anything is mounted.
export const editorSchema = getSchema(editorExtensions);

const base = defaultMarkdownSerializer.nodes;

const serializer = new MarkdownSerializer(
  {
    text: base.text,
    paragraph: base.paragraph,
    blockquote: base.blockquote,
    heading: base.heading,
    listItem: base.list_item,
    // The upstream specs for these three read attributes TipTap does not set,
    // so each would silently lose information: the fence language, the bullet
    // character, the list's starting number.
    codeBlock(state, node) {
      const ticks = node.textContent.match(/`{3,}/gm);
      const fence = ticks ? `${ticks.sort().slice(-1)[0]}\`` : "```";
      state.write(fence + (node.attrs.language || "") + "\n");
      state.text(node.textContent, false);
      state.write("\n");
      state.write(fence);
      state.closeBlock(node);
    },
    bulletList(state, node) {
      // Pinned to "-" so the file matches the "- " people type.
      state.renderList(node, "  ", () => "- ");
    },
    orderedList(state, node) {
      const start: number = node.attrs.start ?? 1;
      const maxWidth = String(start + node.childCount - 1).length;
      const spaces = state.repeat(" ", maxWidth + 2);
      state.renderList(node, spaces, (i) => {
        const n = String(start + i);
        return state.repeat(" ", maxWidth - n.length) + n + ". ";
      });
    },
    horizontalRule: base.horizontal_rule,
    hardBreak: base.hard_break,
  },
  {
    bold: {
      open: "**",
      close: "**",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    italic: {
      open: "*",
      close: "*",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    // GFM strikethrough has no upstream spec at all.
    strike: {
      open: "~~",
      close: "~~",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    // Kept as-is: code handles its own backtick fencing and must not escape,
    // and link carries the autolink detection the text serializer depends on.
    code: defaultMarkdownSerializer.marks.code,
    link: defaultMarkdownSerializer.marks.link,
  },
  {
    // TipTap's node is hardBreak; the default name would leave the serializer
    // unable to recognize a trailing break.
    hardBreakNodeName: "hardBreak",
    // A node with no spec here should fail the save, not disappear from it.
    strict: true,
  },
);

const md = MarkdownIt("commonmark", {
  // Raw HTML stays text, so nothing can enter the document that the schema
  // cannot describe and the serializer cannot write back out.
  html: false,
  linkify: false,
  typographer: false,
}).enable("strikethrough");

const parser = new MarkdownParser(editorSchema, md, {
  paragraph: { block: "paragraph" },
  blockquote: { block: "blockquote" },
  // Token names are markdown-it's (snake_case); block names are the schema's
  // (camelCase). Mixing the two up is silent: unmatched tokens simply produce
  // no node.
  bullet_list: { block: "bulletList" },
  ordered_list: {
    block: "orderedList",
    getAttrs: (tok) => ({ start: Number(tok.attrGet("start")) || 1 }),
  },
  list_item: { block: "listItem" },
  heading: {
    block: "heading",
    // The schema stops at three. Without clamping, an h4 fails to fill and the
    // whole heading disappears along with its text.
    getAttrs: (tok) => ({ level: Math.min(3, Number(tok.tag.slice(1)) || 1) }),
  },
  code_block: { block: "codeBlock", noCloseToken: true },
  fence: {
    block: "codeBlock",
    noCloseToken: true,
    getAttrs: (tok) => ({ language: tok.info.trim().split(/\s+/)[0] || null }),
  },
  hr: { node: "horizontalRule" },
  hardbreak: { node: "hardBreak" },
  // Images are outside the node set, but "image" is a CommonMark token that
  // will appear in pasted or imported text. Both flags are needed: ignore
  // alone registers open/close handlers that never fire, and the parser then
  // throws on the single token it actually gets.
  image: { ignore: true, noCloseToken: true },

  em: { mark: "italic" },
  strong: { mark: "bold" },
  s: { mark: "strike" },
  code_inline: { mark: "code", noCloseToken: true },
  link: { mark: "link", getAttrs: (tok) => ({ href: tok.attrGet("href") }) },
});

export function parseMarkdown(markdown: string): PMNode {
  return parser.parse(markdown);
}

export function serializeMarkdown(doc: PMNode): string {
  // TipTap list items hold block content, so without tightLists every item is
  // separated by a blank line and the file churns on every save.
  return serializer.serialize(doc, { tightLists: true });
}

// Normalizing a loaded document through both directions gives the fixed point
// the editor will produce for unchanged content. Comparing against this, rather
// than against the raw stored string, is what stops the first keystroke-free
// second from rewriting the document.
export function normalizeMarkdown(markdown: string): string {
  return serializeMarkdown(parseMarkdown(markdown));
}
