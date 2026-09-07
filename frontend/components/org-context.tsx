"use client";
import { createContext, useContext } from "react";
import type { Organization } from "@/lib/types";
export const OrgContext = createContext<Organization | null>(null);
export function useOrg() {
  const value = useContext(OrgContext);
  if (!value) throw new Error("useOrg must be inside an organization layout");
  return value;
}
