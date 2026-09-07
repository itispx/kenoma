"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

// A console toggle: it prints its own state and ignites when on.
//
// The two moves are the system's own, turned up rather than invented. Mono is
// the honest type of direct machine feedback (DESIGN.md's Mono-is-Data rule),
// so the track states ON/OFF in it instead of leaving a bare fill to be read.
// And depth here is glow, not shadow (the Glow-is-State rule) — "on" is a
// state, so the checked track carries the mint glow the primary button only
// reaches on hover.
//
// Motion: the throw is the moment. The thumb travels on an exponential
// ease-out, a ring of signal light fires off the edge as the circuit closes,
// and the readout hands over in the thumb's own direction — the label is
// pushed out rather than dissolving in place. Everything else stays still.
// Under prefers-reduced-motion the global override in globals.css collapses
// all of it to an instant swap; the ignition ends fully transparent, so it
// leaves nothing behind when it never plays.
//
// Squared off rather than pill-shaped, per the Soft-Corner Rule: the console
// has no circular or pill elements outside status dots and avatars. Off is an
// outline, matching every other control in the kit (input, select, the org
// switcher trigger); a filled off-state would be near-invisible in the light
// theme, where the console-500..700 band is all near-white.
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        // The `before` block is an invisible 44px-tall hit area: the track is
        // 24px so it reads at the density of the settings row, but a touch
        // target that small is a miss on a phone.
        "focus-console press-scale group/switch relative inline-flex h-6 w-14 shrink-0 items-center rounded-sm border border-console-500 bg-transparent p-0.5 transition-all duration-150 ease-out select-none",
        "before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-['']",
        // The ignition rides its own layer so it never overwrites the focus
        // ring, which is a box-shadow on the root.
        "after:pointer-events-none after:absolute after:inset-0 after:rounded-sm after:content-['']",
        "hover:border-console-400",
        "data-checked:border-signal-info data-checked:bg-signal-info data-checked:shadow-glow-info data-checked:hover:bg-signal-info/90 data-checked:after:animate-ignite",
        "data-disabled:pointer-events-none data-disabled:opacity-50 data-disabled:shadow-none",
        className,
      )}
      {...props}
    >
      {/* The readout is decoration for sighted users only — role="switch" on
          the root already carries the state to assistive tech. Off leaves
          quickly, on arrives with the thumb: exits are faster than entrances. */}
      <span
        aria-hidden
        className="pointer-events-none absolute right-2 font-mono text-[9px] leading-none font-medium tracking-widest text-console-400 uppercase transition-all duration-100 ease-out group-data-[checked]/switch:translate-x-2 group-data-[checked]/switch:opacity-0"
      >
        Off
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute left-2 -translate-x-2 font-mono text-[9px] leading-none font-medium tracking-widest text-ink-on-signal uppercase opacity-0 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[checked]/switch:translate-x-0 group-data-[checked]/switch:opacity-100"
      >
        On
      </span>
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        // 5px keeps the thumb optically concentric inside the 8px track:
        // 8px radius less the 1px border and 2px inset. Exponential ease-out
        // so the throw leaves fast and settles, rather than bouncing.
        className="pointer-events-none relative h-full w-4.5 rounded-[5px] bg-console-300 transition-[transform,background-color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] data-checked:translate-x-8 data-checked:bg-ink-on-signal"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
