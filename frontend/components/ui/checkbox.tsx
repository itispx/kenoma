"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { CheckIcon, MinusIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// The console's own checkbox, replacing the OS control that `accent-color` can
// only tint. Same vocabulary as the select and the switch: an outline when
// off, a signal fill when on, mint ink on the fill.
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "focus-console press-scale relative inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-console-500 bg-transparent transition-all duration-150 ease-out",
        // The checkbox itself is 16px so a dense matrix stays readable; the
        // hit area is padded out to 32px so it is still tappable.
        "before:absolute before:-inset-2 before:content-['']",
        "hover:border-console-400",
        "data-checked:border-signal-info data-checked:bg-signal-info data-indeterminate:border-signal-info data-indeterminate:bg-signal-info",
        "data-disabled:pointer-events-none data-disabled:opacity-45",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-ink-on-signal data-unchecked:hidden"
      >
        {props.indeterminate ? (
          <MinusIcon className="size-3" strokeWidth={3} />
        ) : (
          <CheckIcon className="size-3" strokeWidth={3} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
