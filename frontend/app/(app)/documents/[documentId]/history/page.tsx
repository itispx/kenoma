"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Clock } from "lucide-react";
import { documents as documentsApi } from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { relativeTime } from "@/lib/format";
import type { Revision } from "@/lib/types";

export default function HistoryPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    documentsApi
      .history(documentId)
      .then(setRevisions)
      .finally(() => setLoading(false));
  }, [documentId]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-console-400">Document</div>
          <h1 className="font-heading text-xl font-semibold">Revision history</h1>
        </div>
        <Link
          href={`/documents/${documentId}`}
          className="flex items-center gap-1.5 text-xs text-console-400 hover:text-signal-info transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to document
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-console-400">Loading…</p>
      ) : revisions.length === 0 ? (
        <div className="surface-panel bg-grid p-gutter-lg text-center">
          <p className="text-sm text-console-300">No revisions yet.</p>
        </div>
      ) : (
        <div className="surface-panel divide-y divide-console-600/80">
          {revisions.map((r, i) => (
            <Link
              key={r.id}
              href={`/documents/${documentId}/review/${r.id}`}
              style={{ animationDelay: `${i * 40}ms` }}
              className="animate-stagger-in group flex items-center justify-between gap-3 px-gutter py-row-sm row-hover"
            >
              <div className="flex items-center gap-3">
                <StatusBadge status={r.status} />
                <span className="flex items-center gap-1 text-xs text-console-400">
                  <Clock className="h-3 w-3" />
                  Created {relativeTime(r.created_at)}
                </span>
              </div>
              <span className="text-xs text-console-500">
                {r.reviewed_at
                  ? `Reviewed ${relativeTime(r.reviewed_at)}`
                  : r.submitted_at
                    ? `Submitted ${relativeTime(r.submitted_at)}`
                    : ""}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
