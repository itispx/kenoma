"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { cva, type VariantProps } from "class-variance-authority";
import { CheckIcon, ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";

// Two densities, the two that already exist in the app: `md` matches the form
// input shell (`inputClass` in auth-shell), `sm` matches the controls that sit
// inside table rows and the header.
const selectTriggerVariants = cva(
  "focus-console press-scale group/select-trigger flex w-full items-center justify-between gap-2 rounded-lg border border-console-500 bg-transparent text-left text-console-50 select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-popup-open:border-console-400 aria-invalid:border-signal-error/60",
  {
    variants: {
      size: {
        sm: "px-3 py-1.5 text-sm",
        md: "px-3 py-2.5 text-base",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

function Select<Value, Multiple extends boolean | undefined = false>(
  props: SelectPrimitive.Root.Props<Value, Multiple>,
) {
  return <SelectPrimitive.Root {...props} />;
}

// Renders a <div>, so clicking it focuses the trigger without opening the
// popup — unlike a <label>, which would toggle the button.
function SelectLabel({ className, ...props }: SelectPrimitive.Label.Props) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn(
        "cursor-default text-xs font-medium tracking-wide text-console-300 uppercase",
        className,
      )}
      {...props}
    />
  );
}

function SelectTrigger({
  className,
  size = "md",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & VariantProps<typeof selectTriggerVariants>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(selectTriggerVariants({ size, className }))}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        data-slot="select-icon"
        className="shrink-0 text-console-400 transition-transform duration-150 group-data-[popup-open]/select-trigger:rotate-180"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("truncate data-placeholder:text-console-400", className)}
      {...props}
    />
  );
}

function SelectContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  // Base UI defaults this to true, which overlays the popup on the trigger to
  // line the selected item up with it. The app's other popups all sit below
  // their anchor, and the overlay reads badly against dense table rows.
  alignItemWithTrigger = false,
  className,
  children,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        alignItemWithTrigger={alignItemWithTrigger}
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "surface-panel shadow-panel z-50 min-w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) overflow-hidden bg-console-800 p-1 text-console-50 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        >
          <SelectScrollArrow direction="up" />
          <SelectPrimitive.List
            data-slot="select-list"
            className="max-h-(--available-height) scroll-py-1 overflow-y-auto overscroll-contain outline-none"
          >
            {children}
          </SelectPrimitive.List>
          <SelectScrollArrow direction="down" />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectScrollArrow({ direction }: { direction: "up" | "down" }) {
  const Part =
    direction === "up"
      ? SelectPrimitive.ScrollUpArrow
      : SelectPrimitive.ScrollDownArrow;
  const Icon = direction === "up" ? ChevronUp : ChevronDown;
  return (
    <Part
      data-slot={`select-scroll-${direction}`}
      className="z-1 flex h-5 w-full cursor-default items-center justify-center bg-console-800 text-console-400"
    >
      <Icon className="h-3.5 w-3.5" />
    </Part>
  );
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "row-hover relative flex cursor-default items-center gap-1.5 rounded-md py-2 pr-8 pl-2 text-sm text-console-100 outline-none select-none data-highlighted:bg-console-700 data-highlighted:text-console-50 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText
        data-slot="select-item-text"
        className="truncate"
      >
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        data-slot="select-item-indicator"
        className="pointer-events-none absolute right-2 flex items-center justify-center"
      >
        <CheckIcon className="size-4 text-signal-info" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function SelectGroup({ ...props }: SelectPrimitive.Group.Props) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

// Named GroupLabel, not Label: Base UI throws if this renders outside a Group,
// and the name is the only thing standing between a caller and that crash.
function SelectGroupLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-group-label"
      className={cn(
        "px-2 py-1.5 text-xs font-medium tracking-wide text-console-400 uppercase select-none",
        className,
      )}
      {...props}
    />
  );
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("-mx-1 my-1 h-px bg-console-600", className)}
      {...props}
    />
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  selectTriggerVariants,
};
