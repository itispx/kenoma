"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapImage from "@tiptap/extension-image";
import TiptapLink from "@tiptap/extension-link";
import TiptapUnderline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "tiptap-markdown";
import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Undo2,
  Redo2,
  Link2,
  Table2,
  Rows3,
  Columns3,
  Trash2,
  Minus,
  RemoveFormatting,
  ZoomIn,
  ZoomOut,
  Ruler,
  Check,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ZOOM_STORAGE_KEY = "kenoma-editor-zoom";
const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 10;

const MARGIN_V_STORAGE_KEY = "kenoma-editor-margin-v-cm";
const MARGIN_H_STORAGE_KEY = "kenoma-editor-margin-h-cm";
const MARGIN_DEFAULT_CM = 2.54;
const MARGIN_MIN_CM = 0;
const MARGIN_MAX_CM = 10;
// Matches Word's real built-in margin presets (in cm, converted from its inch
// values) — Word varies top/bottom (v) vs left/right (h) independently per preset.
const MARGIN_PRESETS: { label: string; v: number; h: number }[] = [
  { label: "Narrow", v: 1.27, h: 1.27 },
  { label: "Moderate", v: 2.54, h: 1.91 },
  { label: "Normal", v: 2.54, h: 2.54 },
  { label: "Wide", v: 2.54, h: 5.08 },
];

// tiptap-markdown doesn't ship a module augmentation for @tiptap/core's
// generic Storage type, so TypeScript doesn't know editor.storage.markdown
// exists — this narrow helper is the one place that's cast.
function getMarkdown(editor: Editor): string {
  return (editor.storage as unknown as { markdown: { getMarkdown(): string } }).markdown.getMarkdown();
}

// The editor's internal state is TipTap/ProseMirror JSON; the Markdown
// extension is what lets `content`/`setContent` accept plain Markdown
// strings and getMarkdown() (above) serialize back to one. The API never
// sees TipTap's JSON — only Markdown in and out of this component.
// Underline and text-alignment have no native Markdown syntax; they round-trip
// as raw inline HTML via the `html: true` option below, same mechanism the
// table extension already relies on for anything Markdown can't express.
export function MarkdownEditor({
  content,
  onChange,
  editable = true,
}: {
  content: string;
  onChange?: (markdown: string) => void;
  editable?: boolean;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false, underline: false }),
      TiptapImage,
      TiptapLink.configure({ openOnClick: false }),
      TiptapUnderline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TableKit.configure({ table: { resizable: true } }),
      Markdown.configure({ html: true, transformPastedText: true }),
    ],
    content,
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange?.(getMarkdown(editor));
    },
    editorProps: {
      attributes: {
        class: "kenoma-prose min-h-[500px] rounded-b-sm border border-t-0 border-console-600 bg-console-900 focus:outline-none",
      },
    },
  });

  // Re-sync when a different document/revision is loaded into the same
  // mounted editor instance (e.g. navigating between drafts) — but not on
  // every keystroke, since getMarkdown() during active typing would fight
  // the user's own edits.
  useEffect(() => {
    if (editor && content !== getMarkdown(editor)) {
      editor.commands.setContent(content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);

  // Zoom is a per-browser display preference (like Word's), not document
  // content, so it's kept in localStorage rather than sent to the API.
  const [zoom, setZoom] = useState(100);
  useEffect(() => {
    const stored = Number(window.localStorage.getItem(ZOOM_STORAGE_KEY));
    if (stored >= ZOOM_MIN && stored <= ZOOM_MAX) setZoom(stored);
  }, []);
  function updateZoom(next: number) {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
    setZoom(clamped);
    window.localStorage.setItem(ZOOM_STORAGE_KEY, String(clamped));
  }

  // Page margins are also a per-browser display preference, same rationale as
  // zoom — top/bottom (v) and left/right (h) are independent, matching Word.
  const [marginV, setMarginV] = useState(MARGIN_DEFAULT_CM);
  const [marginH, setMarginH] = useState(MARGIN_DEFAULT_CM);
  useEffect(() => {
    function loadAxis(key: string, setter: (n: number) => void) {
      const raw = window.localStorage.getItem(key);
      const stored = raw === null ? NaN : Number(raw);
      if (stored >= MARGIN_MIN_CM && stored <= MARGIN_MAX_CM) setter(stored);
    }
    loadAxis(MARGIN_V_STORAGE_KEY, setMarginV);
    loadAxis(MARGIN_H_STORAGE_KEY, setMarginH);
  }, []);
  function updateMarginV(next: number) {
    if (Number.isNaN(next)) return;
    const clamped = Math.min(MARGIN_MAX_CM, Math.max(MARGIN_MIN_CM, next));
    setMarginV(clamped);
    window.localStorage.setItem(MARGIN_V_STORAGE_KEY, String(clamped));
  }
  function updateMarginH(next: number) {
    if (Number.isNaN(next)) return;
    const clamped = Math.min(MARGIN_MAX_CM, Math.max(MARGIN_MIN_CM, next));
    setMarginH(clamped);
    window.localStorage.setItem(MARGIN_H_STORAGE_KEY, String(clamped));
  }
  function applyPreset(preset: { v: number; h: number }) {
    updateMarginV(preset.v);
    updateMarginH(preset.h);
  }

  // Ctrl/Cmd + scroll over the document should zoom the document, not the
  // browser page — the wheel listener must be non-passive to preventDefault
  // the native page-zoom, which React's onWheel prop can't do (it's passive).
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = contentWrapperRef.current;
    if (!el) return;
    function handleWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const step = e.deltaY > 0 ? -ZOOM_STEP / 2 : ZOOM_STEP / 2;
      updateZoom(zoomRef.current + step);
    }
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setLink() {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previous ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div>
      <div className="sticky top-14 z-20 flex flex-wrap items-center gap-1.5 rounded-t-sm border border-console-600 bg-console-800/95 p-2.5 shadow-panel backdrop-blur-md">
        {editable && (
        <>
          <ToolbarButton title="Undo" onClick={() => editor?.chain().focus().undo().run()}>
            <Undo2 className="h-5 w-5" />
          </ToolbarButton>
          <ToolbarButton title="Redo" onClick={() => editor?.chain().focus().redo().run()}>
            <Redo2 className="h-5 w-5" />
          </ToolbarButton>
          <Divider />
          <ToolbarButton
            title="Heading 1"
            onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor?.isActive("heading", { level: 1 })}
          >
            <Heading1 className="h-5 w-5" />
          </ToolbarButton>
          <ToolbarButton
            title="Heading 2"
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor?.isActive("heading", { level: 2 })}
          >
            <Heading2 className="h-5 w-5" />
          </ToolbarButton>
          <ToolbarButton
            title="Heading 3"
            onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor?.isActive("heading", { level: 3 })}
          >
            <Heading3 className="h-5 w-5" />
          </ToolbarButton>
          <Divider />
          <ToolbarButton
            title="Bold"
            onClick={() => editor?.chain().focus().toggleBold().run()}
            active={editor?.isActive("bold")}
          >
            <Bold className="h-5 w-5" />
          </ToolbarButton>
          <ToolbarButton
            title="Italic"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            active={editor?.isActive("italic")}
          >
            <Italic className="h-5 w-5" />
          </ToolbarButton>
          <ToolbarButton
            title="Underline"
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
            active={editor?.isActive("underline")}
          >
            <Underline className="h-5 w-5" />
          </ToolbarButton>
          <ToolbarButton
            title="Strikethrough"
            onClick={() => editor?.chain().focus().toggleStrike().run()}
            active={editor?.isActive("strike")}
          >
            <Strikethrough className="h-5 w-5" />
          </ToolbarButton>
          <ToolbarButton
            title="Clear formatting"
            onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
          >
            <RemoveFormatting className="h-5 w-5" />
          </ToolbarButton>
          <Divider />
          <ToolbarButton
            title="Align left"
            onClick={() => editor?.chain().focus().setTextAlign("left").run()}
            active={editor?.isActive({ textAlign: "left" })}
          >
            <AlignLeft className="h-5 w-5" />
          </ToolbarButton>
          <ToolbarButton
            title="Align center"
            onClick={() => editor?.chain().focus().setTextAlign("center").run()}
            active={editor?.isActive({ textAlign: "center" })}
          >
            <AlignCenter className="h-5 w-5" />
          </ToolbarButton>
          <ToolbarButton
            title="Align right"
            onClick={() => editor?.chain().focus().setTextAlign("right").run()}
            active={editor?.isActive({ textAlign: "right" })}
          >
            <AlignRight className="h-5 w-5" />
          </ToolbarButton>
          <ToolbarButton
            title="Justify"
            onClick={() => editor?.chain().focus().setTextAlign("justify").run()}
            active={editor?.isActive({ textAlign: "justify" })}
          >
            <AlignJustify className="h-5 w-5" />
          </ToolbarButton>
          <Divider />
          <ToolbarButton
            title="Bullet list"
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            active={editor?.isActive("bulletList")}
          >
            <List className="h-5 w-5" />
          </ToolbarButton>
          <ToolbarButton
            title="Numbered list"
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            active={editor?.isActive("orderedList")}
          >
            <ListOrdered className="h-5 w-5" />
          </ToolbarButton>
          <ToolbarButton
            title="Blockquote"
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            active={editor?.isActive("blockquote")}
          >
            <Quote className="h-5 w-5" />
          </ToolbarButton>
          <Divider />
          <ToolbarButton title="Insert link" onClick={setLink} active={editor?.isActive("link")}>
            <Link2 className="h-5 w-5" />
          </ToolbarButton>
          <ToolbarButton
            title="Horizontal rule"
            onClick={() => editor?.chain().focus().setHorizontalRule().run()}
          >
            <Minus className="h-5 w-5" />
          </ToolbarButton>
          <Divider />
          <ToolbarButton
            title="Insert table"
            onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          >
            <Table2 className="h-5 w-5" />
          </ToolbarButton>
          {editor?.isActive("table") && (
            <>
              <ToolbarButton title="Add row" onClick={() => editor?.chain().focus().addRowAfter().run()}>
                <Rows3 className="h-5 w-5" />
              </ToolbarButton>
              <ToolbarButton title="Add column" onClick={() => editor?.chain().focus().addColumnAfter().run()}>
                <Columns3 className="h-5 w-5" />
              </ToolbarButton>
              <ToolbarButton title="Delete table" onClick={() => editor?.chain().focus().deleteTable().run()}>
                <Trash2 className="h-5 w-5" />
              </ToolbarButton>
            </>
          )}
        </>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger
              title="Margins"
              className="inline-flex items-center justify-center rounded-md border border-transparent px-2.5 py-2 text-console-300 transition-all hover:border-console-500 hover:text-console-50"
            >
              <Ruler className="h-5 w-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 border-console-600 bg-console-800 text-console-50">
              {MARGIN_PRESETS.map((preset) => (
                <DropdownMenuItem key={preset.label} onClick={() => applyPreset(preset)}>
                  <Check
                    className={`h-3.5 w-3.5 ${
                      Math.abs(marginV - preset.v) < 0.01 && Math.abs(marginH - preset.h) < 0.01
                        ? "opacity-100"
                        : "opacity-0"
                    }`}
                  />
                  {preset.label}
                  <span className="ml-auto text-xs text-console-400">
                    {preset.v.toFixed(2)} / {preset.h.toFixed(2)} cm
                  </span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <div className="flex items-center gap-2 px-1.5 py-1">
                <label htmlFor="margin-v-input" className="w-16 text-sm">
                  Vertical
                </label>
                <input
                  id="margin-v-input"
                  type="number"
                  min={MARGIN_MIN_CM}
                  max={MARGIN_MAX_CM}
                  step={0.1}
                  value={Number(marginV.toFixed(2))}
                  onChange={(e) => updateMarginV(e.target.valueAsNumber)}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="ml-auto w-16 rounded-sm border border-console-600 bg-console-900 px-1.5 py-0.5 text-right text-sm tabular-nums outline-none focus:border-signal-info"
                />
                <span className="text-xs text-console-400">cm</span>
              </div>
              <div className="flex items-center gap-2 px-1.5 py-1">
                <label htmlFor="margin-h-input" className="w-16 text-sm">
                  Horizontal
                </label>
                <input
                  id="margin-h-input"
                  type="number"
                  min={MARGIN_MIN_CM}
                  max={MARGIN_MAX_CM}
                  step={0.1}
                  value={Number(marginH.toFixed(2))}
                  onChange={(e) => updateMarginH(e.target.valueAsNumber)}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="ml-auto w-16 rounded-sm border border-console-600 bg-console-900 px-1.5 py-0.5 text-right text-sm tabular-nums outline-none focus:border-signal-info"
                />
                <span className="text-xs text-console-400">cm</span>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <Divider />
          <ToolbarButton title="Zoom out" onClick={() => updateZoom(zoom - ZOOM_STEP)}>
            <ZoomOut className="h-5 w-5" />
          </ToolbarButton>
          <button
            type="button"
            title="Reset zoom"
            onClick={() => updateZoom(100)}
            className="w-14 rounded-md border border-transparent px-1.5 py-2 text-center text-xs text-console-300 tabular-nums hover:border-console-500 hover:text-console-50 transition-colors"
          >
            {zoom}%
          </button>
          <ToolbarButton title="Zoom in" onClick={() => updateZoom(zoom + ZOOM_STEP)}>
            <ZoomIn className="h-5 w-5" />
          </ToolbarButton>
        </div>
      </div>
      <div
        ref={contentWrapperRef}
        style={
          {
            zoom: `${zoom}%`,
            "--doc-margin-v": `${marginV}cm`,
            "--doc-margin-h": `${marginH}cm`,
          } as React.CSSProperties
        }
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Divider() {
  return <div className="mx-1.5 h-6 w-px bg-console-600" />;
}

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-md border px-2.5 py-2 transition-all ${
        active
          ? "border-signal-info/60 bg-signal-info/15 text-signal-info shadow-glow-info"
          : "border-transparent text-console-300 hover:border-console-500 hover:text-console-50"
      }`}
    >
      {children}
    </button>
  );
}
