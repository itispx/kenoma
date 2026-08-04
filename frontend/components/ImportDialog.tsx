"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { documents as documentsApi, importApi, ApiError } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Document } from "@/lib/types";

type TargetMode = "new" | "existing";

function Choice<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md border px-3 py-2 text-sm transition-all ${
            value === o.value
              ? "border-signal-info/60 bg-signal-info/10 text-signal-info shadow-glow-info"
              : "border-console-600 text-console-300 hover:border-console-500"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ImportDialog({
  projectId,
  open,
  onOpenChange,
  onImported,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (documentId: string) => void;
}) {
  const [target, setTarget] = useState<TargetMode>("new");
  const [existingDocs, setExistingDocs] = useState<Document[]>([]);
  const [existingDocId, setExistingDocId] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && target === "existing") {
      documentsApi.list(projectId).then(setExistingDocs).catch(() => {});
    }
  }, [open, target, projectId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (!file) throw new Error("Choose a .docx file first.");
      const documentId = target === "existing" ? existingDocId : undefined;
      const result = await importApi.docx(projectId, file, title, documentId);
      toast.success("Import complete");
      onOpenChange(false);
      onImported(result.document.id);
    } catch (err) {
      toast.error("Couldn't import document", {
        description: err instanceof ApiError ? err.message : (err as Error).message,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border border-console-600 bg-console-800 text-console-50 shadow-panel">
        <DialogHeader>
          <DialogTitle className="font-heading">Import a document</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Choice
            value={target}
            onChange={setTarget}
            options={[
              { value: "new", label: "New document" },
              { value: "existing", label: "Existing document" },
            ]}
          />

          {target === "existing" ? (
            <select
              required
              value={existingDocId}
              onChange={(e) => setExistingDocId(e.target.value)}
              className="rounded-md border border-console-500 bg-console-900 px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Choose a document…
              </option>
              {existingDocs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs uppercase tracking-wide text-console-300">Title</span>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-md border border-console-500 bg-console-900 px-3 py-2 focus-console transition-shadow"
              />
            </label>
          )}

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-wide text-console-300">Word file (.docx)</span>
            <input
              type="file"
              accept=".docx"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm file:mr-3 file:rounded-md file:border file:border-console-500 file:bg-console-700 file:px-3 file:py-1.5 file:text-console-50 file:text-xs"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="hover-lift press-scale rounded-md border border-signal-info/50 bg-signal-info/10 px-3 py-2 text-sm text-signal-info hover:bg-signal-info/20 transition-colors disabled:opacity-50"
          >
            {submitting ? "Importing…" : "Import"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
