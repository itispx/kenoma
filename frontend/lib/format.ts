// Truncated id for the "console identifier" affordance used throughout the
// UI (e.g. `a1b2c3d4`) — not cryptographically meaningful, purely a
// glanceable short reference alongside the full name/title.
export function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}

export function relativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = date.getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const abs = Math.abs(diffSec);

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, secs] of units) {
    if (abs >= secs) {
      return rtf.format(Math.round(diffSec / secs), unit);
    }
  }
  return rtf.format(diffSec, "second");
}
