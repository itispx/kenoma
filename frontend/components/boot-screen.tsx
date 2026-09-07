import { Logo } from "@/components/logo";

// Shown for the brief window while the app confirms whether there's an
// active session (root-page redirect, and the authenticated-app shell
// before that same check resolves). Rather than hide the wait or flash a
// bare "loading…" string, this leans into it: a HUD panel frames the mark,
// a working indicator, and the session status readout like a system coming
// online. Every element after the initial materialize is a *looping*
// animation (never a one-shot timed to a guessed duration) so it still
// reads as "working," not "stuck," no matter how long the actual check
// takes.
export function BootScreen() {
  return (
    <div
      aria-busy="true"
      className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-console-950"
    >
      <div className="animate-materialize relative z-10 w-full max-w-md px-4">
        <div className="surface-panel shadow-panel flex flex-col gap-5 p-gutter-lg">
          <div className="flex items-center justify-between gap-4">
            <Logo variant="full" className="h-8 w-auto" />
            <span className="flex items-center gap-1.5 text-xs text-console-400">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-signal-info animate-pulse-glow"
              />
              Working
            </span>
          </div>

          <div className="h-1 w-full overflow-hidden rounded-full bg-console-700">
            <div
              className="animate-scan-sweep-loop h-full w-full rounded-full"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, transparent, rgb(81 240 168 / 0.9), transparent)",
                backgroundSize: "50% 100%",
                backgroundRepeat: "no-repeat",
              }}
            />
          </div>

          <ul
            role="status"
            aria-live="polite"
            className="flex flex-col gap-1.5 font-mono text-xs text-console-400"
          >
            <li
              style={{ animationDelay: "260ms" }}
              className="animate-stagger-in"
            >
              Establishing secure session…
            </li>
            <li
              style={{ animationDelay: "620ms" }}
              className="animate-stagger-in flex items-center gap-1.5"
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-signal-info"
              />
              Loading your workspace
              <span
                aria-hidden="true"
                className="animate-caret-blink inline-block h-[1.1em] w-[0.5em] bg-signal-info align-middle"
              />
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
