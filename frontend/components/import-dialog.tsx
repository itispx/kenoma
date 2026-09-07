"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { primaryBtn } from "@/components/auth-shell";
import { cn } from "@/lib/utils";

// Shared picker for the two docx import paths: starting a new document, and
// proposing a new version of an existing one. The caller supplies the upload
// handler; everything about picking and confirming lives here.
export function ImportDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  onSubmit: (file: File) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Reset when closed so reopening never shows the previous choice.
  const inputRef = useRef<HTMLInputElement>(null);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFile(null);
      setError("");
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
    onOpenChange(next);
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(file);
      handleOpenChange(false);
    } catch {
      setError("Could not import this file.");
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <input
          ref={inputRef}
          type="file"
          accept=".docx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full rounded-sm border border-console-600 bg-console-950 px-3 py-2 text-sm text-console-100 file:mr-3 file:rounded-sm file:border-0 file:bg-console-700 file:px-2 file:py-1 file:text-xs file:text-console-100"
        />
        {error && (
          <p role="alert" className="text-xs text-signal-error">
            {error}
          </p>
        )}
        <DialogFooter>
          <button
            type="button"
            disabled={!file || busy}
            onClick={() => void submit()}
            className={cn(primaryBtn, "w-auto")}
          >
            {busy ? "Importing…" : submitLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
