"use client";

import { useCallback, useEffect, useState } from "react";
import { projects } from "./api";
import type { PermissionKey } from "./types";

// Drives permission-aware UI (hide/disable actions the user can't perform)
// without waiting on a 403 from the backend. The backend still re-checks
// every mutating request itself — this is purely a UX optimization, never
// the actual authorization boundary.
export function useProjectPermissions(projectId: string | undefined) {
  const [keys, setKeys] = useState<Set<PermissionKey>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    projects
      .myPermissions(projectId)
      .then((list) => {
        if (!cancelled) setKeys(new Set(list ?? []));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const has = useCallback((key: PermissionKey) => keys.has(key), [keys]);

  return { has, loading, keys };
}
