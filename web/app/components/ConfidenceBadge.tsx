import { Gauge } from "lucide-react";
import { Badge } from "./Badge";
import { ICON_INLINE } from "./icons";

// Coarse-heuristic confidence from the extractor (0.75 threshold-only, 0.90
// clauses/events, 0.95 exact figure). Shown as a plain percentage with a
// two-tier tint -- deliberately no false precision beyond the number.
const CONFIDENCE_STYLES = {
  high: "bg-emerald-100 text-emerald-700",
  low: "bg-amber-100 text-amber-800",
};

export function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence == null) return null;
  const pct = Math.round(confidence * 100);
  const style = confidence >= 0.9 ? CONFIDENCE_STYLES.high : CONFIDENCE_STYLES.low;
  return (
    <Badge className={style} title="Extractor confidence (coarse heuristic)">
      <Gauge className={ICON_INLINE} />
      <span className="font-mono normal-case tracking-normal">{pct}%</span>
    </Badge>
  );
}
