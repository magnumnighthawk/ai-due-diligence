"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, CheckCircle2, FileText, ShieldQuestion, XCircle } from "lucide-react";
import {
  fetchDocument,
  fetchReviewQueue,
  reviewFinding,
  type DocumentDetail,
  type ReviewAction,
  type ReviewQueueFinding,
} from "../lib/api";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { findingPreview } from "./FindingCard";
import DocumentViewer from "./DocumentViewer";
import { Badge } from "./Badge";
import { PanelHeader, Empty } from "./panels";
import { workstreamIcon, ICON_DEFAULT, ICON_INLINE } from "./icons";
import { CURRENT_USER } from "../lib/user";

export default function ReviewQueueView({ onError }: { onError: (msg: string) => void }) {
  const [queue, setQueue] = useState<ReviewQueueFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioned, setActioned] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [doc, setDoc] = useState<DocumentDetail | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchReviewQueue()
      .then(setQueue)
      .catch((e) => onError(String(e)))
      .finally(() => setLoading(false));
  }, [onError]);

  useEffect(() => load(), [load]);

  const selectFinding = useCallback(
    async (f: ReviewQueueFinding) => {
      setSelectedId(f.id);
      try {
        if (!doc || doc.id !== f.doc_id) setDoc(await fetchDocument(f.doc_id));
      } catch (e) {
        onError(String(e));
      }
    },
    [doc, onError],
  );

  // Auto-select the first item so the source panel is never blank while
  // there's something to review; keep the selection valid as the queue shrinks.
  useEffect(() => {
    if (queue.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId === null || !queue.some((f) => f.id === selectedId)) {
      void selectFinding(queue[0]);
    }
  }, [queue, selectedId, selectFinding]);

  const selected = queue.find((f) => f.id === selectedId) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden bg-graphite-50 p-4 lg:grid lg:grid-cols-[minmax(420px,1fr)_minmax(380px,1fr)]">
      {/* Queue */}
      <section className="flex min-h-0 flex-col overflow-hidden rounded-card bg-graphite-0 shadow-card">
        <PanelHeader icon={<ShieldQuestion className={ICON_DEFAULT} />}>
          Review queue · {queue.length} awaiting
          {actioned > 0 && <span className="ml-2 text-graphite-500">· {actioned} actioned</span>}
        </PanelHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <Empty>Loading the review queue…</Empty>
          ) : queue.length === 0 ? (
            <Empty>
              Nothing awaiting review. Findings that entity resolution can&apos;t confidently
              auto-link land here for an analyst to confirm or dismiss before they feed a risk.
            </Empty>
          ) : (
            <>
              <p className="mb-3 text-body text-graphite-600">
                These findings fell below the entity-resolution threshold — a false link is worse
                than a missing one, so they wait here for a human decision rather than being
                auto-linked. Select one to see its source; each action records who, when, and why.
              </p>
              <ul className="space-y-3">
                {queue.map((f) => (
                  <li key={f.id}>
                    <ReviewCard
                      finding={f}
                      selected={selectedId === f.id}
                      onSelect={() => selectFinding(f)}
                      onError={onError}
                      onActioned={() => {
                        setQueue((q) => q.filter((x) => x.id !== f.id));
                        setActioned((n) => n + 1);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      {/* Source document -- the same highlighted-span viewer the register uses,
          so a reviewer can see exactly what a cryptic offset refers to. */}
      <section className="flex min-h-0 flex-col overflow-hidden rounded-card bg-graphite-0 shadow-card">
        <PanelHeader icon={<FileText className={ICON_DEFAULT} />}>Source document</PanelHeader>
        {!doc || !selected ? (
          <Empty>Select a finding to view its cited span in the source.</Empty>
        ) : (
          <DocumentViewer
            doc={doc}
            highlight={{ char_start: selected.char_start, char_end: selected.char_end }}
          />
        )}
      </section>
    </div>
  );
}

function ReviewCard({
  finding,
  selected,
  onSelect,
  onError,
  onActioned,
}: {
  finding: ReviewQueueFinding;
  selected: boolean;
  onSelect: () => void;
  onError: (msg: string) => void;
  onActioned: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const Icon = workstreamIcon(finding.workstream);

  async function act(status: ReviewAction) {
    if (busy) return;
    setBusy(true);
    try {
      await reviewFinding(finding.id, status, CURRENT_USER, note.trim() || null);
      onActioned();
    } catch (e) {
      onError(String(e));
      setBusy(false);
    }
  }

  return (
    <div
      className={`rounded-card border p-4 transition-all duration-150 ${
        selected
          ? "border-signal-400 bg-signal-50 ring-1 ring-signal-200"
          : "border-graphite-200 bg-graphite-0 shadow-raised"
      }`}
    >
      {/* Summary is a button that selects the finding for source preview.
          The note + action controls are siblings, not nested, so no button
          nests inside a button. */}
      <button
        onClick={onSelect}
        className="w-full rounded-chip text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-graphite-0"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-graphite-100 font-mono text-micro font-bold tabular-nums text-graphite-600">
            {finding.id}
          </span>
          <Icon className={`${ICON_DEFAULT} shrink-0 text-graphite-400`} />
          <span className="text-body font-semibold text-graphite-700">
            {finding.kind.replace(/_/g, " ")}
          </span>
          <div className="ml-auto">
            <ConfidenceBadge confidence={finding.confidence} />
          </div>
        </div>

        <p className="mt-2 text-body leading-snug text-graphite-700">{findingPreview(finding)}</p>

        <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-2">
          <Badge className="bg-graphite-100 text-graphite-600">{finding.workstream}</Badge>
          <span className="inline-flex items-center gap-1 text-micro text-graphite-600">
            <Building2 className={ICON_INLINE} />
            unresolved entity
          </span>
          <span className="min-w-0 truncate font-mono text-micro text-graphite-600">
            {finding.doc_id} · {finding.char_start}–{finding.char_end}
          </span>
        </div>
      </button>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reason (optional) — recorded in the audit trail"
          className="min-w-0 flex-1 rounded-chip border border-graphite-300 bg-graphite-0 px-3 py-1.5 text-body text-graphite-800 placeholder:text-graphite-500 focus:border-signal-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal-200"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => act("confirmed")}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-chip bg-emerald-600 px-3 py-1.5 text-micro font-semibold text-graphite-0 transition-all duration-150 hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-graphite-0 active:scale-[0.98] disabled:opacity-50"
          >
            <CheckCircle2 className={ICON_INLINE} />
            Confirm
          </button>
          <button
            onClick={() => act("dismissed")}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-chip border border-graphite-300 bg-graphite-0 px-3 py-1.5 text-micro font-semibold text-graphite-700 transition-all duration-150 hover:border-rose-300 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 focus-visible:ring-offset-graphite-0 active:scale-[0.98] disabled:opacity-50"
          >
            <XCircle className={ICON_INLINE} />
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
