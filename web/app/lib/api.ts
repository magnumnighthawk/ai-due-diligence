export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export type RiskSummary = {
  id: number;
  title: string;
  severity: "High" | "Medium" | "Low" | string;
  source: string;
  review_status: string;
  finding_count: number;
};

export type FindingDetail = {
  id: number;
  workstream: string;
  kind: string;
  payload: Record<string, unknown>;
  entity_name: string | null;
  doc_id: string;
  doc_title: string;
  char_start: number;
  char_end: number;
  confidence: number | null;
  review_status: string;
};

export type RiskDetail = {
  id: number;
  title: string;
  severity: string;
  rationale: string;
  source: string;
  review_status: string;
  findings: FindingDetail[];
};

export type DocumentDetail = {
  id: string;
  title: string;
  doc_type: string;
  workstream: string;
  source_url: string;
  raw_text: string;
};

export type Citation = {
  marker: number;
  doc_id: string;
  doc_title: string;
  section: string;
  char_start: number;
  char_end: number;
  snippet: string;
};

export type AskResponse = {
  answer: string;
  citations: Citation[];
};

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export const fetchRisks = () => getJSON<RiskSummary[]>("/risks");
export const fetchRisk = (id: number) => getJSON<RiskDetail>(`/risks/${id}`);
export const fetchDocument = (id: string) =>
  getJSON<DocumentDetail>(`/documents/${encodeURIComponent(id)}`);

export async function fetchAsk(question: string): Promise<AskResponse> {
  const res = await fetch(`${API_BASE}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error(`/ask -> ${res.status}`);
  return res.json() as Promise<AskResponse>;
}

// Marks an answer the pipeline declined to answer from the corpus.
export function isAbstention(answer: string): boolean {
  return answer.toLowerCase().includes("insufficient evidence");
}
