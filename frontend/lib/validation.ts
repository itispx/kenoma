// Client-side format checks only — a UX nicety so a mistyped field lights
// up before the round-trip, never a substitute for the backend's own
// validation (internal/handlers/validate.go), which is what actually
// enforces these rules.

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
