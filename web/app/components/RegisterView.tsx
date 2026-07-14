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
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(280px,1fr)_minmax(340px,1.25fr)_minmax(380px,1.6fr)]">
      {/* Panel 1: risk register */}
      <section className="flex min-h-0 flex-col overflow-y-auto border-r border-graphite-200 bg-graphite-0">
        <PanelHeader icon={<AlertTriangle className={ICON_DEFAULT} />}>
          Risk register · {risks.length}
        </PanelHeader>
        <ul className="p-2">
          {risks.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => selectRisk(r.id)}
                className={`mb-1.5 w-full rounded-card border px-3 py-2.5 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-graphite-0 active:scale-[0.99] ${
                  selectedRisk?.id === r.id
                    ? "border-signal-400 bg-signal-50 ring-1 ring-signal-200"
                    : "border-graphite-200 bg-graphite-0 hover:border-graphite-300 hover:shadow-raised"
                }`}
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <SeverityBadge severity={r.severity} />
                  <SourceBadge source={r.source} />
                  {r.review_status === "needs_review" && <ReviewBadge />}
                </div>
                <div className="text-body font-medium leading-snug text-graphite-800">{r.title}</div>
                <div className="mt-1.5 flex items-center gap-1 text-micro text-graphite-600">
                  <ListTree className={ICON_INLINE} />
                  {r.finding_count} linked findings
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Panel 2: rationale + findings */}
      <section className="flex min-h-0 flex-col overflow-y-auto border-r border-graphite-200 bg-graphite-50/50">
        <PanelHeader icon={<ListTree className={ICON_DEFAULT} />}>Rationale & findings</PanelHeader>
        {!selectedRisk ? (
          <Empty>Select a risk to see its rationale and linked findings.</Empty>
        ) : (
          <div className="px-4 py-3">
            <div className="mb-3 rounded-card border border-graphite-200 bg-graphite-0 p-3">
              <Rationale
                rationale={selectedRisk.rationale}
                findings={selectedRisk.findings}
                onSelectFinding={selectFinding}
                activeFindingId={selectedFinding?.id ?? null}
              />
              <p className="mt-2 text-micro uppercase tracking-wide text-graphite-600">
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
      <section className="flex min-h-0 flex-col overflow-hidden bg-graphite-0">
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
