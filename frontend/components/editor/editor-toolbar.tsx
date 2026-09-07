"use client";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Redo2,
  SquareCode,
  Strikethrough,
  TextQuote,
  Undo2,
  Unlink,
} from "lucide-react";
import { useSyncExternalStore } from "react";
import { ToolbarButton, ToolbarSeparator } from "./toolbar-button";
export function EditorToolbar({
  editor,
  disabled,
  onEditLink,
}: {
  editor: Editor;
  disabled?: boolean;
  onEditLink: () => void;
}) {
  // Read after mount, the same way ThemeToggle does it: the server cannot know
  // the platform, so the first client render has to match its guess and correct
  // itself afterwards.
  const isMac = useSyncExternalStore(
    () => () => {},
    () => /Mac|iPhone|iPad/.test(navigator.userAgent),
    () => false,
  );
  const mod = isMac ? "⌘" : "Ctrl";
  // Read through a selector rather than calling editor.isActive during render:
  // the editor is configured not to re-render on every transaction, so a direct
  // read would show whatever was true when React last happened to render.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      // Each mark is probed with its own command. One shared probe cannot
      // stand in for all of them: the code mark excludes every other mark, so
      // a toggleBold() probe reports false inside inline code and would
      // disable the very button that removes it.
      canBold: e.can().chain().toggleBold().run(),
      canItalic: e.can().chain().toggleItalic().run(),
      canStrike: e.can().chain().toggleStrike().run(),
      canCode: e.can().chain().toggleCode().run(),
    }),
  });
  const chain = () => editor.chain().focus();
  return (
    <div
      role="group"
      aria-label="Formatting"
      // Slides under the app header, which is sticky at z-30. Opaque, and no
      // backdrop blur: the page behind is a flat opaque canvas, so there was
      // nothing to blur, but the filter still forced a compositing layer and
      // cost the toolbar's labels their subpixel antialiasing.
      className="sticky top-14 z-20 -mx-1 mb-4 flex flex-wrap items-center gap-1 border-b border-console-600/80 bg-console-950 px-1 py-1.5"
    >
      <ToolbarButton
        icon={Undo2}
        label="Undo"
        shortcut={`${mod}+Z`}
        disabled={disabled || !state.canUndo}
        onClick={() => chain().undo().run()}
      />
      <ToolbarButton
        icon={Redo2}
        label="Redo"
        shortcut={`${mod}+Shift+Z`}
        disabled={disabled || !state.canRedo}
        onClick={() => chain().redo().run()}
      />
      <ToolbarSeparator />
      <ToolbarButton
        icon={Heading1}
        label="Heading 1"
        shortcut={`${mod}+Alt+1`}
        active={state.h1}
        disabled={disabled}
        onClick={() => chain().toggleHeading({ level: 1 }).run()}
      />
      <ToolbarButton
        icon={Heading2}
        label="Heading 2"
        shortcut={`${mod}+Alt+2`}
        active={state.h2}
        disabled={disabled}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        icon={Heading3}
        label="Heading 3"
        shortcut={`${mod}+Alt+3`}
        active={state.h3}
        disabled={disabled}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
      />
      <ToolbarSeparator />
      <ToolbarButton
        icon={Bold}
        label="Bold"
        shortcut={`${mod}+B`}
        active={state.bold}
        disabled={disabled || !state.canBold}
        onClick={() => chain().toggleBold().run()}
      />
      <ToolbarButton
        icon={Italic}
        label="Italic"
        shortcut={`${mod}+I`}
        active={state.italic}
        disabled={disabled || !state.canItalic}
        onClick={() => chain().toggleItalic().run()}
      />
      <ToolbarButton
        icon={Strikethrough}
        label="Strikethrough"
        shortcut={`${mod}+Shift+S`}
        active={state.strike}
        disabled={disabled || !state.canStrike}
        onClick={() => chain().toggleStrike().run()}
      />
      <ToolbarButton
        icon={Code}
        label="Inline code"
        shortcut={`${mod}+E`}
        active={state.code}
        disabled={disabled || !state.canCode}
        onClick={() => chain().toggleCode().run()}
      />
      {state.link ? (
        <ToolbarButton
          icon={Unlink}
          label="Remove link"
          active
          disabled={disabled}
          onClick={() => chain().unsetLink().run()}
        />
      ) : (
        <ToolbarButton
          icon={Link2}
          label="Add link"
          shortcut={`${mod}+K`}
          disabled={disabled}
          onClick={onEditLink}
        />
      )}
      <ToolbarSeparator />
      <ToolbarButton
        icon={List}
        label="Bulleted list"
        shortcut={`${mod}+Shift+8`}
        active={state.bullet}
        disabled={disabled}
        onClick={() => chain().toggleBulletList().run()}
      />
      <ToolbarButton
        icon={ListOrdered}
        label="Numbered list"
        shortcut={`${mod}+Shift+7`}
        active={state.ordered}
        disabled={disabled}
        onClick={() => chain().toggleOrderedList().run()}
      />
      <ToolbarSeparator />
      <ToolbarButton
        icon={TextQuote}
        label="Quote"
        shortcut={`${mod}+Shift+B`}
        active={state.quote}
        disabled={disabled}
        onClick={() => chain().toggleBlockquote().run()}
      />
      <ToolbarButton
        icon={SquareCode}
        label="Code block"
        shortcut={`${mod}+Alt+C`}
        active={state.codeBlock}
        disabled={disabled}
        onClick={() => chain().toggleCodeBlock().run()}
      />
      <ToolbarButton
        icon={Minus}
        label="Divider"
        disabled={disabled}
        onClick={() => chain().setHorizontalRule().run()}
      />
    </div>
  );
}
