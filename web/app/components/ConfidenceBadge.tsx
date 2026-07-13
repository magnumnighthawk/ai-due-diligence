import { Gauge } from "lucide-react";

// Coarse-heuristic confidence from the extractor (0.75 threshold-only, 0.90
// clauses/events, 0.95 exact figure). Shown as a plain percentage with a
// two-tier tint -- deliberately no false precision beyond the number.
export function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence == null) return null;
  const pct = Math.round(confidence * 100);
  const high = confidence >= 0.9;
  const style = high
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : "bg-amber-50 text-amber-700 ring-amber-200";
  return (
    <span
      title="Extractor confidence (coarse heuristic)"
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${style}`}
    >
      <Gauge className="h-3 w-3" />
      {pct}%
    </span>
  );
}
