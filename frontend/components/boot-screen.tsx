import { Logo } from "@/components/logo";

// Shown for the brief window while the app confirms whether there's an
// active session (root-page redirect, and the authenticated-app shell
// before that same check resolves). Rather than hide the wait or flash a
// bare "loading…" string, this leans into it: the mark assembling,
// piece by piece, like a system powering on. Every element after the
// initial materialize is a *looping* animation (never a one-shot timed
// to a guessed duration) so it still reads as "working," not "stuck," no
// matter how long the actual check takes.
export function BootScreen() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden bg-console-950 bg-grid">
      <div className="bg-scanlines pointer-events-none absolute inset-0 opacity-30" />

      <div className="animate-materialize relative z-10 flex flex-col items-center gap-3">
        <Logo variant="full" className="h-10 w-auto animate-pulse-glow" />
      </div>

      <div
        style={{ animationDelay: "120ms" }}
        className="animate-stagger-in relative z-10 flex w-60 flex-col gap-3"
      >
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

        <ul className="flex flex-col gap-1.5 text-xs text-console-400">
          <li style={{ animationDelay: "260ms" }} className="animate-stagger-in">
            Establishing secure session…
          </li>
          <li style={{ animationDelay: "620ms" }} className="animate-stagger-in flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-signal-info animate-pulse-glow" />
            Loading your workspace
            <span className="animate-caret-blink text-signal-info">▍</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
