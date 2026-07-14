"use client";

import { Building2 } from "lucide-react";
import type { FindingDetail } from "../lib/api";
import { Badge } from "./Badge";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { workstreamIcon, ICON_DEFAULT, ICON_INLINE } from "./icons";

type Props = {
  finding: FindingDetail;
  position: number;
  selected: boolean;
  onSelect: () => void;
  cardRef?: (el: HTMLElement | null) => void;
};

export default function FindingCard({ finding, position, selected, onSelect, cardRef }: Props) {
  const Icon = workstreamIcon(finding.workstream);
  return (
    <button
      ref={cardRef}
      onClick={onSelect}
      className={`w-full rounded-card border px-4 py-3.5 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-graphite-50 active:scale-[0.99] ${
        selected
          ? "border-signal-400 bg-signal-50 ring-1 ring-signal-200"
          : "border-graphite-200 bg-graphite-0 shadow-raised hover:shadow-lifted"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-micro font-bold tabular-nums ${
            selected ? "bg-signal-600 text-graphite-0" : "bg-graphite-100 text-graphite-600"
          }`}
        >
          {position}
        </span>
        <Icon className={`${ICON_DEFAULT} shrink-0 text-graphite-400`} />
        <span className="text-body font-semibold text-graphite-700">
          {finding.kind.replace(/_/g, " ")}
        </span>
        <div className="ml-auto">
          <ConfidenceBadge confidence={finding.confidence} />
        </div>
      </div>

      {finding.entity_name && (
        <div className="mt-2 flex items-center gap-1 text-xs text-graphite-600">
          <Building2 className={ICON_INLINE} />
          {finding.entity_name}
        </div>
      )}

      <p className="mt-1.5 text-body leading-snug text-graphite-700">{findingPreview(finding)}</p>

      <div className="mt-2.5 flex min-w-0 items-center gap-2">
        <Badge className="bg-graphite-100 text-graphite-600">{finding.workstream}</Badge>
        <span className="min-w-0 truncate font-mono text-micro text-graphite-600">
          {finding.doc_id} · {finding.char_start}–{finding.char_end}
        </span>
      </div>
    </button>
  );
}

export function findingPreview(f: FindingDetail): string {
  const p = f.payload;
  if (f.kind === "customer_concentration") {
    const pct = p.pct_revenue ?? p.pct_revenue_threshold ?? "?";
    return `${p.customer_name}: ${pct} (${p.period})`;
  }
  if (f.kind === "contract_clause") {
    return `${p.clause_type}: ${String(p.summary ?? "").slice(0, 140)}`;
  }
  if (f.kind === "personnel_event") {
    return `${p.person} — ${p.event_type} (${p.role}), ${p.date}`;
  }
  return JSON.stringify(p).slice(0, 140);
}
