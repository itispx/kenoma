// The editor's schema is deliberately no larger than Markdown can express.
// Every node and mark here has a matching entry in lib/markdown.ts, and the
// serializer runs in strict mode, so adding an extension without adding those
// two entries breaks saving loudly rather than dropping content quietly.
import { Placeholder } from "@tiptap/extensions";
import { StarterKit } from "@tiptap/starter-kit";

export const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    // No Markdown representation, so it would be a formatting control whose
    // result vanishes on the next save.
    underline: false,
    // Appends a phantom paragraph after the last block. Harmless on screen,
    // but it lands in the document and serializes as a trailing blank line
    // that grows by one on every load.
    trailingNode: false,
    codeBlock: { languageClassPrefix: "language-" },
    link: {
      // Following a link while editing it makes the link unfixable.
      openOnClick: false,
      // Without this, typing a bare URL silently gains a link mark and comes
      // back as <url> after a round trip.
      autolink: false,
      linkOnPaste: true,
      markdownLinks: true,
      defaultProtocol: "https",
      HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
    },
    dropcursor: { color: "#51F0A8", width: 2 },
  }),
  Placeholder.configure({
    placeholder: "Start writing…",
    emptyEditorClass: "is-editor-empty",
  }),
];
