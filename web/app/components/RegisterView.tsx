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
import { ICON_DEFAULT, ICON_INLINE } from "./icons";

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
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden bg-graphite-50 p-4 lg:grid-cols-[minmax(280px,1fr)_minmax(340px,1.25fr)_minmax(380px,1.6fr)]">
      {/* Panel 1: risk register */}
      <section className="flex min-h-0 flex-col overflow-hidden rounded-card bg-graphite-0 shadow-card">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <PanelHeader icon={<AlertTriangle className={ICON_DEFAULT} />}>
            Risk register · {risks.length}
          </PanelHeader>
          <ul className="p-2.5">
            {risks.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => selectRisk(r.id)}
                  className={`mb-2 w-full rounded-card border px-3.5 py-3 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-graphite-0 active:scale-[0.99] ${
                    selectedRisk?.id === r.id
                      ? "border-signal-400 bg-signal-50 ring-1 ring-signal-200"
                      : "border-graphite-200 bg-graphite-0 shadow-raised hover:shadow-lifted"
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <SeverityBadge severity={r.severity} />
                    <SourceBadge source={r.source} />
                    {r.review_status === "needs_review" && <ReviewBadge />}
                  </div>
                  <div className="text-body font-medium leading-snug text-graphite-800">{r.title}</div>
                  <div className="mt-2 flex items-center gap-1 text-micro text-graphite-600">
                    <ListTree className={ICON_INLINE} />
                    {r.finding_count} linked findings
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Panel 2: rationale + findings */}
      <section className="flex min-h-0 flex-col overflow-hidden rounded-card bg-graphite-0 shadow-card">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <PanelHeader icon={<ListTree className={ICON_DEFAULT} />}>Rationale & findings</PanelHeader>
          {!selectedRisk ? (
            <Empty>Select a risk to see its rationale and linked findings.</Empty>
          ) : (
            <div className="px-5 py-4">
              <div className="mb-4 rounded-card bg-graphite-50 p-4 shadow-raised">
                <Rationale
                  rationale={selectedRisk.rationale}
                  findings={selectedRisk.findings}
                  onSelectFinding={selectFinding}
                  activeFindingId={selectedFinding?.id ?? null}
                />
                <p className="mt-3 text-micro uppercase tracking-wide text-graphite-600">
                  Numbered references map to the findings below — click to trace the source.
                </p>
              </div>
              <ul className="space-y-2.5">
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
        </div>
      </section>

      {/* Panel 3: source document */}
      <section className="flex min-h-0 flex-col overflow-hidden rounded-card bg-graphite-0 shadow-card">
        <PanelHeader icon={<FileText className={ICON_DEFAULT} />}>Source document</PanelHeader>
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
