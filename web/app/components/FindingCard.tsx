"use client";

import { Building2 } from "lucide-react";
import type { FindingDetail } from "../lib/api";
import { Badge } from "./Badge";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { workstreamIcon } from "./icons";

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
      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-all ${
        selected
          ? "border-indigo-400 bg-indigo-50/60 ring-1 ring-indigo-200"
          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold tabular-nums ${
            selected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
          }`}
        >
          {position}
        </span>
        <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="text-xs font-semibold text-slate-700">
          {finding.kind.replace(/_/g, " ")}
        </span>
        <div className="ml-auto">
          <ConfidenceBadge confidence={finding.confidence} />
        </div>
      </div>

      {finding.entity_name && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-500">
          <Building2 className="h-3 w-3" />
          {finding.entity_name}
        </div>
      )}

      <p className="mt-1 text-xs leading-snug text-slate-600">{findingPreview(finding)}</p>

      <div className="mt-2 flex items-center gap-2">
        <Badge className="bg-slate-100 text-slate-500">{finding.workstream}</Badge>
        <span className="font-mono text-[10px] text-slate-400">
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
