"use client";
import { useCallback, useEffect, useState } from "react";
import { projects } from "./api";
import type { PermissionKey } from "./types";
export function usePermissions(projectId: string) {
  const [keys, setKeys] = useState<Set<PermissionKey>>(new Set());
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // The caller may not know the project yet: on the document route it only
    // arrives with the document. Staying in the loading state keeps the UI from
    // briefly deciding the answer is "no permissions".
    if (!projectId) return;
    let live = true;
    projects
      .myPermissions(projectId)
      .then((items) => {
        if (live) setKeys(new Set(items));
      })
      .catch(() => {
        if (live) setKeys(new Set());
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [projectId]);
  const has = useCallback((key: PermissionKey) => keys.has(key), [keys]);
  return { has, loading };
}
