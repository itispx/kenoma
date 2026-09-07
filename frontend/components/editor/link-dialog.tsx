"use client";
import { FormEvent, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, inputClass, primaryBtn } from "@/components/auth-shell";
import { cn } from "@/lib/utils";
// Controlled rather than trigger-driven: the toolbar button that opens this has
// to suppress mousedown to keep the editor's selection alive, which a Base UI
// trigger would undo. Mounted only while open, so the field starts from the
// current link each time instead of syncing itself in an effect.
export function LinkDialog({
  open,
  initialHref,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  initialHref: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (href: string) => void;
}) {
  const [href, setHref] = useState(initialHref);
  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = href.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Add a link</DialogTitle>
            <DialogDescription className="text-console-300">
              The selected text becomes the link. With nothing selected, the
              address is inserted as the text.
            </DialogDescription>
          </DialogHeader>
          <div className="my-4">
            <Field label="Address">
              <input
                autoFocus
                className={inputClass}
                placeholder="https://"
                value={href}
                onChange={(e) => setHref(e.target.value)}
              />
            </Field>
          </div>
          <DialogFooter className="border-console-600 bg-console-800">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg border border-console-500 px-3 py-2 text-sm"
            >
              Cancel
            </button>
            <button className={cn(primaryBtn, "w-auto")}>Add link</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
