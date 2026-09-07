"use client";
import { createContext, useContext } from "react";
import type { Project } from "@/lib/types";
// The layout owns the fetch, so it also owns the setter: renaming happens on a
// child page, and without a way back up the tab bar would keep showing the old
// name until a full reload.
export const ProjectContext = createContext<{
  project: Project;
  setProject: (p: Project) => void;
} | null>(null);
export function useProject() {
  const value = useContext(ProjectContext);
  if (!value) throw new Error("useProject must be inside a project layout");
  return value;
}
