"use client";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
// `trigger` is rendered *as* the trigger, not wrapped in one: Base UI merges
// its props onto the caller's element, so the element must be a real <button>
// (wrapping one in a <span> trigger strips the native button semantics and
// nests two interactive elements).
//
// `trigger` is optional: a dialog opened from a menu item has to be controlled
// instead, since Base UI unmounts the item (and any trigger inside it) as the
// menu closes.
export function ConfirmDialog({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  confirm,
  onConfirm,
}: {
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: string;
  confirm: string;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent className="surface-panel border-console-600 bg-console-800 text-console-50">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-console-300">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="border-console-600 bg-console-800">
          <DialogClose className="rounded-lg border border-console-500 px-3 py-2 text-sm">
            Cancel
          </DialogClose>
          <DialogClose
            onClick={onConfirm}
            className="rounded-lg bg-signal-error px-3 py-2 text-sm font-medium text-console-950"
          >
            {confirm}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
