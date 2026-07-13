"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, FileText, ListTree } from "lucide-react";
import {
  fetchDocument,
  fetchRisk,
  fetchRisks,
  type DocumentDetail,
  type FindingDetail,
  type RiskDetail,
  type RiskSummary,
} from "../lib/api";
import DocumentViewer from "./DocumentViewer";
import FindingCard from "./FindingCard";
import Rationale from "./Rationale";
import { ReviewBadge, SeverityBadge, SourceBadge } from "./Badge";
import { PanelHeader, Empty } from "./panels";

export default function RegisterView({ onError }: { onError: (msg: string) => void }) {
  const [risks, setRisks] = useState<RiskSummary[]>([]);
  const [selectedRisk, setSelectedRisk] = useState<RiskDetail | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<FindingDetail | null>(null);
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const cardRefs = useRef<Map<number, HTMLElement | null>>(new Map());

  useEffect(() => {
    fetchRisks().then(setRisks).catch((e) => onError(String(e)));
  }, [onError]);

  async function selectRisk(id: number) {
    setSelectedFinding(null);
    setDoc(null);
    try {
      setSelectedRisk(await fetchRisk(id));
    } catch (e) {
      onError(String(e));
    }
  }

  async function selectFinding(finding: FindingDetail) {
    setSelectedFinding(finding);
    cardRefs.current.get(finding.id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    try {
      if (!doc || doc.id !== finding.doc_id) setDoc(await fetchDocument(finding.doc_id));
    } catch (e) {
      onError(String(e));
    }
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[minmax(280px,1fr)_minmax(340px,1.25fr)_minmax(380px,1.6fr)]">
      {/* Panel 1: risk register */}
      <section className="flex min-h-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
        <PanelHeader icon={<AlertTriangle className="h-3.5 w-3.5" />}>
          Risk register · {risks.length}
        </PanelHeader>
        <ul className="p-2">
          {risks.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => selectRisk(r.id)}
                className={`mb-1.5 w-full rounded-lg border px-3 py-2.5 text-left transition-all ${
                  selectedRisk?.id === r.id
                    ? "border-indigo-400 bg-indigo-50/60 ring-1 ring-indigo-200"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                }`}
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <SeverityBadge severity={r.severity} />
                  <SourceBadge source={r.source} />
                  {r.review_status === "needs_review" && <ReviewBadge />}
                </div>
                <div className="text-[13px] font-medium leading-snug text-slate-800">{r.title}</div>
                <div className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400">
                  <ListTree className="h-3 w-3" />
                  {r.finding_count} linked findings
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Panel 2: rationale + findings */}
      <section className="flex min-h-0 flex-col overflow-y-auto border-r border-slate-200 bg-slate-50/50">
        <PanelHeader icon={<ListTree className="h-3.5 w-3.5" />}>Rationale & findings</PanelHeader>
        {!selectedRisk ? (
          <Empty>Select a risk to see its rationale and linked findings.</Empty>
        ) : (
          <div className="px-4 py-3">
            <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3">
              <Rationale
                rationale={selectedRisk.rationale}
                findings={selectedRisk.findings}
                onSelectFinding={selectFinding}
                activeFindingId={selectedFinding?.id ?? null}
              />
              <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-400">
                Numbered references map to the findings below — click to trace the source.
              </p>
            </div>
            <ul className="space-y-2">
              {selectedRisk.findings.map((f, i) => (
                <li key={f.id}>
                  <FindingCard
                    finding={f}
                    position={i + 1}
                    selected={selectedFinding?.id === f.id}
                    onSelect={() => selectFinding(f)}
                    cardRef={(el) => cardRefs.current.set(f.id, el)}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Panel 3: source document */}
      <section className="flex min-h-0 flex-col overflow-hidden bg-white">
        <PanelHeader icon={<FileText className="h-3.5 w-3.5" />}>Source document</PanelHeader>
        {!doc || !selectedFinding ? (
          <Empty>Select a finding to view its cited span in the source.</Empty>
        ) : (
          <DocumentViewer
            doc={doc}
            highlight={{ char_start: selectedFinding.char_start, char_end: selectedFinding.char_end }}
          />
        )}
      </section>
    </div>
  );
}
