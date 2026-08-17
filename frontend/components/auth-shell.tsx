"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";

export function Field({
  label,
  hint,
  error,
  errorId,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  errorId?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-console-300">{label}</span>
      {children}
      {/* The message slot is always laid out, so an error appearing fills it
          instead of pushing the rest of the form down. min-h-4 reserves
          exactly one line of text-xs. role="alert" on the persistent element
          means a screen reader announces the message when it arrives. */}
      <span
        id={errorId}
        role="alert"
        className={`block min-h-4 text-xs ${error ? "text-signal-error" : "text-console-400"}`}
      >
        {error ?? hint}
      </span>
    </label>
  );
}

// Transparent fill + `lg` (12px) radius, matching DESIGN.md's input-default
// spec (and the app's own shadcn Input) — this used to fill with
// bg-console-900 and round at `md`, drifting from the system's own tokens.
export const inputClass =
  "w-full bg-transparent border border-console-500 rounded-lg px-3 py-2.5 text-base text-console-50 placeholder:text-console-400 focus-console transition-shadow duration-150";

// Same field chrome, swapped to the error focus-ring treatment
// (`focus-console-error`, signal-magenta glow) — applied once a field has
// been touched and fails validation, instead of leaving the browser's
// native validation bubble as the only feedback.
export const inputErrorClass = inputClass
  .replace("border-console-500", "border-signal-error/60")
  .replace("focus-console", "focus-console-error");

// Solid signal-mint fill + near-black text, matching DESIGN.md's
// button-primary spec (the One Signal Rule: the one non-semantic accent
// reserved for the single primary action per screen) — this used to be a
// 10%-tint outline that read as secondary rather than primary.
export const primaryBtn =
  "w-full rounded-lg bg-signal-info px-3 py-2.5 text-sm font-medium text-console-950 hover:bg-signal-info/80 hover:shadow-glow-info hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none disabled:hover:translate-y-0";

// Hairline outline on a transparent fill, per DESIGN.md's button-outline spec.
// For a real action that isn't the screen's primary one — keeping mint reserved
// means a secondary action can sit next to a primary without competing.
export const secondaryBtn =
  "w-full rounded-lg border border-console-500 bg-transparent px-3 py-2.5 text-sm font-medium text-console-100 hover:border-console-400 hover:bg-console-700/40 hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none disabled:hover:translate-y-0 disabled:hover:bg-transparent";

// Wraps a password <input> with a show/hide toggle, so typing a new
// password twice (register, reset-password) doesn't require clearing both
// fields to double-check what was typed. The toggle stays in normal tab
// order (no tabIndex={-1}) so keyboard users can reach it right after the
// field, and it carries its own accessible name since it's icon-only.
export function PasswordField({
  hasError,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { hasError?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={`${hasError ? inputErrorClass : inputClass} pr-10 ${className ?? ""}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="focus-console absolute right-2.5 top-1/2 -translate-y-1/2 rounded-sm text-console-400 hover:text-signal-info transition-colors"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="text-signal-info underline underline-offset-2 hover:text-glow-info transition-all">
      {children}
    </a>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-x-hidden overflow-y-auto bg-console-950 bg-grid py-8">
      <div className="bg-scanlines pointer-events-none absolute inset-0 opacity-40" />

      <div className="absolute right-4 top-4 rounded-md border border-console-600 p-0.5">
        <ThemeToggle />
      </div>

      <div className="animate-materialize relative z-10 w-full max-w-md px-4">
        <div className="mb-6 flex flex-col items-center gap-1.5 text-center">
          <Logo variant="full" className="h-9 w-auto animate-float" />
          <div className="h-[3px] w-[3px] rounded-full bg-console-600" aria-hidden="true" />
          <div className="text-xs font-medium uppercase tracking-widest text-console-400">
            Every revision tracked, every change reviewed.
          </div>
        </div>

        <div className="surface-panel shadow-panel p-gutter-lg">
          <h1 className="mb-1 font-heading text-[1.0625rem] font-semibold">{title}</h1>
          <p className="mb-6 text-sm text-console-300">{subtitle}</p>
          <div className="mt-2.5">{children}</div>
        </div>
      </div>
    </main>
  );
}
