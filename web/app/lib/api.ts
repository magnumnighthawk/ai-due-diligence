import { CURRENT_USER } from "./user";

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
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
};

export type ReviewQueueFinding = {
  id: number;
  workstream: string;
  kind: string;
  payload: Record<string, unknown>;
  doc_id: string;
  doc_title: string;
  char_start: number;
  char_end: number;
  confidence: number | null;
  review_status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
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

export const fetchReviewQueue = () =>
  getJSON<ReviewQueueFinding[]>("/review-queue");

export type ReviewAction = "confirmed" | "dismissed";

export type ReviewResult = {
  target_type: string;
  target_id: number;
  review_status: string;
  reviewed_by: string;
  reviewed_at: string;
  review_note: string | null;
};

async function patchReview(
  path: string,
  status: ReviewAction,
  reviewer: string,
  note: string | null,
): Promise<ReviewResult> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, reviewer, note }),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<ReviewResult>;
}

export const reviewFinding = (
  id: number,
  status: ReviewAction,
  reviewer: string,
  note: string | null,
) => patchReview(`/findings/${id}/review`, status, reviewer, note);

export const reviewRisk = (
  id: number,
  status: ReviewAction,
  reviewer: string,
  note: string | null,
) => patchReview(`/risks/${id}/review`, status, reviewer, note);

export async function fetchAsk(question: string): Promise<AskResponse> {
  const res = await fetch(`${API_BASE}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // operator is the governance "who" recorded in the query audit log.
    body: JSON.stringify({ question, operator: CURRENT_USER }),
  });
  if (!res.ok) throw new Error(`/ask -> ${res.status}`);
  return res.json() as Promise<AskResponse>;
}

// Marks an answer the pipeline declined to answer from the corpus.
export function isAbstention(answer: string): boolean {
  return answer.toLowerCase().includes("insufficient evidence");
}
