"""Reviewer confirm/dismiss workflow -- the human-in-the-loop layer the brief
requires ("review checkpoints and escalation paths"). Turns the passive
review_status field into an action: an analyst confirms or dismisses an item,
and the who/when/why is recorded immutably in review_events while the item's
current state is denormalised onto the row for display.
"""
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .db import get_conn

router = APIRouter()

_TABLES = {"finding": "findings", "risk": "risks"}


class ReviewRequest(BaseModel):
    status: Literal["confirmed", "dismissed"]
    reviewer: str
    note: str | None = None


class ReviewResult(BaseModel):
    target_type: str
    target_id: int
    review_status: str
    reviewed_by: str
    reviewed_at: datetime
    review_note: str | None


def _apply_review(target_type: str, target_id: int, req: ReviewRequest) -> ReviewResult:
    table = _TABLES[target_type]
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(f"SELECT review_status FROM {table} WHERE id = %s", (target_id,))
            row = cur.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail=f"{target_type} {target_id} not found")
            from_status = row[0]

            reviewed_at = datetime.utcnow()
            cur.execute(
                f"""
                UPDATE {table}
                SET review_status = %s, reviewed_by = %s, reviewed_at = %s, review_note = %s
                WHERE id = %s
                """,
                (req.status, req.reviewer, reviewed_at, req.note, target_id),
            )
            # Immutable audit row -- one per action, never updated.
            cur.execute(
                """
                INSERT INTO review_events (target_type, target_id, from_status, to_status, reviewer, note)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (target_type, target_id, from_status, req.status, req.reviewer, req.note),
            )
        conn.commit()
    finally:
        conn.close()
    return ReviewResult(
        target_type=target_type, target_id=target_id, review_status=req.status,
        reviewed_by=req.reviewer, reviewed_at=reviewed_at, review_note=req.note,
    )


@router.patch("/findings/{finding_id}/review", response_model=ReviewResult)
def review_finding(finding_id: int, req: ReviewRequest):
    return _apply_review("finding", finding_id, req)


@router.patch("/risks/{risk_id}/review", response_model=ReviewResult)
def review_risk(risk_id: int, req: ReviewRequest):
    return _apply_review("risk", risk_id, req)


class ReviewQueueFinding(BaseModel):
    id: int
    workstream: str
    kind: str
    payload: dict[str, Any]
    doc_id: str
    doc_title: str
    char_start: int
    char_end: int
    confidence: float | None
    review_status: str
    reviewed_by: str | None
    reviewed_at: datetime | None
    review_note: str | None


@router.get("/review-queue", response_model=list[ReviewQueueFinding])
def review_queue(status: str = "needs_review"):
    """Findings awaiting (or already actioned by) human review. Defaults to
    the open queue -- items entity resolution declined to auto-link, which
    are exactly the ones a human must adjudicate before they can feed a
    high-confidence risk."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT f.id, f.workstream, f.kind, f.payload, f.doc_id, d.title,
                       f.char_start, f.char_end, f.confidence, f.review_status,
                       f.reviewed_by, f.reviewed_at, f.review_note
                FROM findings f
                JOIN documents d ON d.id = f.doc_id
                WHERE f.review_status = %s
                ORDER BY f.id
                """,
                (status,),
            )
            rows = cur.fetchall()
    finally:
        conn.close()
    return [
        ReviewQueueFinding(
            id=r[0], workstream=r[1], kind=r[2], payload=r[3], doc_id=r[4], doc_title=r[5],
            char_start=r[6], char_end=r[7], confidence=r[8], review_status=r[9],
            reviewed_by=r[10], reviewed_at=r[11], review_note=r[12],
        )
        for r in rows
    ]
