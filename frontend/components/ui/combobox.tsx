"use client";

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { CheckIcon, ChevronDown, X } from "lucide-react";

import { cn } from "@/lib/utils";

// The searchable sibling of Select. Popup, item, and motion treatment are kept
// identical to select.tsx on purpose: a user should not be able to tell which
// primitive backs a given control.

function Combobox<Value, Multiple extends boolean | undefined = false>(
  props: ComboboxPrimitive.Root.Props<Value, Multiple>,
) {
  return <ComboboxPrimitive.Root {...props} />;
}

function ComboboxInputGroup({
  className,
  ...props
}: ComboboxPrimitive.InputGroup.Props) {
  return (
    <ComboboxPrimitive.InputGroup
      data-slot="combobox-input-group"
      className={cn(
        "focus-console-within relative flex w-full cursor-text flex-wrap items-center gap-1 rounded-lg border border-console-500 bg-transparent px-3 py-1.5 text-base text-console-50 data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-input"
      className={cn(
        "h-8 min-w-16 flex-1 border-0 bg-transparent p-0 text-base text-console-50 outline-none placeholder:text-console-400",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxTrigger({
  className,
  ...props
}: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-md text-console-400 transition-colors duration-150 hover:text-console-50 data-popup-open:rotate-180",
        className,
      )}
      {...props}
    >
      <ChevronDown className="h-3.5 w-3.5" />
    </ComboboxPrimitive.Trigger>
  );
}

function ComboboxClear({ className, ...props }: ComboboxPrimitive.Clear.Props) {
  return (
    <ComboboxPrimitive.Clear
      data-slot="combobox-clear"
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-md text-console-400 transition-colors duration-150 hover:text-console-50",
        className,
      )}
      {...props}
    >
      <X className="h-3.5 w-3.5" />
    </ComboboxPrimitive.Clear>
  );
}

function ComboboxChips({ className, ...props }: ComboboxPrimitive.Chips.Props) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      className={cn("flex w-full flex-wrap items-center gap-1", className)}
      {...props}
    />
  );
}

function ComboboxChip({ className, ...props }: ComboboxPrimitive.Chip.Props) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        "group/combobox-chip flex cursor-default items-center gap-1 rounded-sm border border-console-600 bg-console-700 py-0.5 pr-1 pl-2 text-xs text-console-100 outline-none focus-within:border-signal-info data-highlighted:border-signal-info",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxChipRemove({
  className,
  ...props
}: ComboboxPrimitive.ChipRemove.Props) {
  return (
    <ComboboxPrimitive.ChipRemove
      data-slot="combobox-chip-remove"
      className={cn(
        "flex size-4 items-center justify-center rounded-sm text-console-400 transition-colors duration-150 hover:bg-console-600 hover:text-console-50",
        className,
      )}
      {...props}
    >
      <X className="h-3 w-3" />
    </ComboboxPrimitive.ChipRemove>
  );
}

function ComboboxContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  className,
  children,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            "surface-panel shadow-panel z-50 w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) overflow-hidden bg-console-800 p-1 text-console-50 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        >
          {children}
        </ComboboxPrimitive.Popup>
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        "max-h-(--available-height) scroll-py-1 overflow-y-auto overscroll-contain outline-none data-empty:hidden",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxItem({
  className,
  children,
  ...props
}: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "row-hover relative flex cursor-default items-center gap-1.5 rounded-md py-2 pr-8 pl-2 text-sm text-console-100 outline-none select-none data-highlighted:bg-console-700 data-highlighted:text-console-50 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span className="truncate">{children}</span>
      <ComboboxPrimitive.ItemIndicator
        data-slot="combobox-item-indicator"
        className="pointer-events-none absolute right-2 flex items-center justify-center"
      >
        <CheckIcon className="size-4 text-signal-info" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxGroup({ ...props }: ComboboxPrimitive.Group.Props) {
  return <ComboboxPrimitive.Group data-slot="combobox-group" {...props} />;
}

// Named GroupLabel, not Label: Base UI throws if this renders outside a Group.
function ComboboxGroupLabel({
  className,
  ...props
}: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-group-label"
      className={cn(
        "px-2 py-1.5 text-xs font-medium tracking-wide text-console-400 uppercase select-none",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn("px-2 py-3 text-sm text-console-400", className)}
      {...props}
    />
  );
}

function ComboboxSeparator({
  className,
  ...props
}: ComboboxPrimitive.Separator.Props) {
  return (
    <ComboboxPrimitive.Separator
      data-slot="combobox-separator"
      className={cn("-mx-1 my-1 h-px bg-console-600", className)}
      {...props}
    />
  );
}

const ComboboxCollection = ComboboxPrimitive.Collection;
const ComboboxValue = ComboboxPrimitive.Value;
const useComboboxFilter = ComboboxPrimitive.useFilter;

export {
  Combobox,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxClear,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxFilter,
};
