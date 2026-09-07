// Save states shared by the save badge. Local branch persistence is fast and
// synchronous-feeling, so there is no "saving" limbo state: a write either
// landed (saved) or did not (error).
export type SaveStatus = "idle" | "dirty" | "saved" | "error";
