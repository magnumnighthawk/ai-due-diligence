from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .db import get_conn

router = APIRouter()


class RiskSummary(BaseModel):
    id: int
    title: str
    severity: str
    source: str
    review_status: str
    finding_count: int


class FindingDetail(BaseModel):
    id: int
    workstream: str
    kind: str
    payload: dict[str, Any]
    entity_name: str | None
    doc_id: str
    doc_title: str
    char_start: int
    char_end: int
    confidence: float | None
    review_status: str
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None
    review_note: str | None = None


class RiskDetail(BaseModel):
    id: int
    title: str
    severity: str
    rationale: str
    source: str
    review_status: str
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None
    review_note: str | None = None
    findings: list[FindingDetail]


class DocumentDetail(BaseModel):
    id: str
    title: str
    doc_type: str
    workstream: str
    source_url: str
    raw_text: str


# Order risks so the register reads like a triaged worklist: severity first,
# then rule-based (certain) risks above agent-proposed (needs-verification) ones.
_SEVERITY_ORDER = "CASE severity WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 WHEN 'Low' THEN 2 ELSE 3 END"


@router.get("/risks", response_model=list[RiskSummary])
def list_risks():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT id, title, severity, source, review_status,
                       COALESCE(array_length(finding_ids, 1), 0) AS finding_count
                FROM risks
                ORDER BY {_SEVERITY_ORDER}, source, id
                """
            )
            rows = cur.fetchall()
    finally:
        conn.close()
    return [
        RiskSummary(id=r[0], title=r[1], severity=r[2], source=r[3], review_status=r[4], finding_count=r[5])
        for r in rows
    ]


@router.get("/risks/{risk_id}", response_model=RiskDetail)
def get_risk(risk_id: int):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, title, severity, rationale, source, review_status, finding_ids,
                       reviewed_by, reviewed_at, review_note
                FROM risks WHERE id = %s
                """,
                (risk_id,),
            )
            risk = cur.fetchone()
            if risk is None:
                raise HTTPException(status_code=404, detail=f"risk {risk_id} not found")

            finding_ids = risk[6] or []
            findings: list[FindingDetail] = []
            if finding_ids:
                cur.execute(
                    """
                    SELECT f.id, f.workstream, f.kind, f.payload, e.canonical_name,
                           f.doc_id, d.title, f.char_start, f.char_end, f.confidence, f.review_status,
                           f.reviewed_by, f.reviewed_at, f.review_note
                    FROM findings f
                    JOIN documents d ON d.id = f.doc_id
                    LEFT JOIN entities e ON e.id = f.entity_id
                    WHERE f.id = ANY(%s)
                    ORDER BY array_position(%s, f.id)
                    """,
                    (finding_ids, finding_ids),
                )
                findings = [
                    FindingDetail(
                        id=fr[0], workstream=fr[1], kind=fr[2], payload=fr[3], entity_name=fr[4],
                        doc_id=fr[5], doc_title=fr[6], char_start=fr[7], char_end=fr[8],
                        confidence=fr[9], review_status=fr[10],
                        reviewed_by=fr[11], reviewed_at=fr[12], review_note=fr[13],
                    )
                    for fr in cur.fetchall()
                ]
    finally:
        conn.close()

    return RiskDetail(
        id=risk[0], title=risk[1], severity=risk[2], rationale=risk[3],
        source=risk[4], review_status=risk[5],
        reviewed_by=risk[7], reviewed_at=risk[8], review_note=risk[9],
        findings=findings,
    )


@router.get("/documents/{doc_id}", response_model=DocumentDetail)
def get_document(doc_id: str):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, title, doc_type, workstream, source_url, raw_text FROM documents WHERE id = %s",
                (doc_id,),
            )
            row = cur.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail=f"document {doc_id} not found")
    finally:
        conn.close()
    return DocumentDetail(
        id=row[0], title=row[1], doc_type=row[2], workstream=row[3], source_url=row[4], raw_text=row[5]
    )
