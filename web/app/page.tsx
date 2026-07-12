"use client";

import { useEffect, useState } from "react";
import DocumentViewer from "./components/DocumentViewer";
import {
  fetchDocument,
  fetchRisk,
  fetchRisks,
  type DocumentDetail,
  type FindingDetail,
  type RiskDetail,
  type RiskSummary,
} from "./lib/api";

const SEVERITY_STYLES: Record<string, string> = {
  High: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  Medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  Low: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${className}`}>
      {children}
    </span>
  );
}

export default function Home() {
  const [risks, setRisks] = useState<RiskSummary[]>([]);
  const [selectedRisk, setSelectedRisk] = useState<RiskDetail | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<FindingDetail | null>(null);
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRisks().then(setRisks).catch((e) => setError(String(e)));
  }, []);

  async function selectRisk(id: number) {
    setSelectedFinding(null);
    setDoc(null);
    try {
      const detail = await fetchRisk(id);
      setSelectedRisk(detail);
    } catch (e) {
      setError(String(e));
    }
  }

  async function selectFinding(finding: FindingDetail) {
    setSelectedFinding(finding);
    try {
      // Only re-fetch the document if we're switching to a different one.
      if (!doc || doc.id !== finding.doc_id) {
        setDoc(await fetchDocument(finding.doc_id));
      }
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <main className="flex h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
        <h1 className="text-lg font-semibold">AI Due Diligence — Risk Radar</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Surrogate deal room built from real Universal Display Corporation SEC filings.
          Click a risk → its findings → the cited span in the source document.
        </p>
      </header>

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-5 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error} — is the API running on {process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"}?
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[minmax(280px,1fr)_minmax(320px,1.2fr)_minmax(360px,1.6fr)]">
        {/* Panel 1: risk register */}
        <section className="flex flex-col overflow-y-auto border-r border-zinc-200 dark:border-zinc-800">
          <PanelHeader>Risk register ({risks.length})</PanelHeader>
          <ul>
            {risks.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => selectRisk(r.id)}
                  className={`w-full border-b border-zinc-100 px-4 py-3 text-left transition-colors hover:bg-zinc-100 dark:border-zinc-900 dark:hover:bg-zinc-900 ${
                    selectedRisk?.id === r.id ? "bg-zinc-100 dark:bg-zinc-900" : ""
                  }`}
                >
                  <div className="mb-1 flex items-center gap-1.5">
                    <Badge className={SEVERITY_STYLES[r.severity] ?? SEVERITY_STYLES.Low}>{r.severity}</Badge>
                    <Badge className="bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">{r.source}</Badge>
                    {r.review_status === "needs_review" && (
                      <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                        needs review
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm leading-snug">{r.title}</div>
                  <div className="mt-1 text-xs text-zinc-500">{r.finding_count} linked findings</div>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Panel 2: selected risk + its findings */}
        <section className="flex flex-col overflow-y-auto border-r border-zinc-200 dark:border-zinc-800">
          <PanelHeader>Findings</PanelHeader>
          {!selectedRisk ? (
            <Empty>Select a risk to see its linked findings.</Empty>
          ) : (
            <div className="px-4 py-3">
              <p className="mb-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                {selectedRisk.rationale}
              </p>
              <ul className="space-y-2">
                {selectedRisk.findings.map((f) => (
                  <li key={f.id}>
                    <button
                      onClick={() => selectFinding(f)}
                      className={`w-full rounded border px-3 py-2 text-left text-xs transition-colors hover:border-blue-400 ${
                        selectedFinding?.id === f.id
                          ? "border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40"
                          : "border-zinc-200 dark:border-zinc-800"
                      }`}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <Badge className="bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          {f.workstream}
                        </Badge>
                        <span className="font-medium">{f.kind}</span>
                        {f.entity_name && (
                          <span className="text-zinc-500">→ {f.entity_name}</span>
                        )}
                      </div>
                      <div className="text-zinc-600 dark:text-zinc-400">{findingPreview(f)}</div>
                      <div className="mt-1 font-mono text-[10px] text-zinc-400">
                        {f.doc_id} · chars {f.char_start}–{f.char_end}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Panel 3: document viewer with highlighted cited span */}
        <section className="flex flex-col overflow-hidden">
          <PanelHeader>Source document</PanelHeader>
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
    </main>
  );
}

function PanelHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-6 text-xs text-zinc-400">{children}</div>;
}

function findingPreview(f: FindingDetail): string {
  const p = f.payload;
  if (f.kind === "customer_concentration") {
    const pct = p.pct_revenue ?? p.pct_revenue_threshold ?? "?";
    return `${p.customer_name}: ${pct} (${p.period})`;
  }
  if (f.kind === "contract_clause") {
    return `${p.clause_type}: ${String(p.summary ?? "").slice(0, 120)}`;
  }
  if (f.kind === "personnel_event") {
    return `${p.person} — ${p.event_type} (${p.role}), ${p.date}`;
  }
  return JSON.stringify(p).slice(0, 120);
}
