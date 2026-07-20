"""Query/answer audit log. Every /ask is recorded with the question, the
answer, whether the system abstained, and the exact source spans surfaced --
so any answer ever shown to a reviewer can be reconstructed after the fact.
In a real deal room this is the evidentiary trail behind an AI-assisted
finding; here it also doubles as usage telemetry.
"""
from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel
from psycopg.types.json import Json

from .db import get_conn

router = APIRouter()


def log_query(
    question: str,
    workstream: str | None,
    doc_type: str | None,
    answer: str,
    abstained: bool,
    citations: list[dict],
    latency_ms: int,
    operator: str | None = None,
) -> None:
    """Best-effort audit write -- never let a logging failure break the
    user-facing answer path."""
    try:
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO query_log
                        (operator, question, workstream, doc_type, answer, abstained,
                         citation_count, citations, latency_ms)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        operator,
                        question,
                        workstream,
                        doc_type,
                        answer,
                        abstained,
                        len(citations),
                        Json(citations),
                        latency_ms,
                    ),
                )
            conn.commit()
        finally:
            conn.close()
    except Exception as e:  # pragma: no cover - audit must not break /ask
        print(f"[audit] query log write failed: {e}")


class QueryLogEntry(BaseModel):
    id: int
    operator: str | None
    question: str
    workstream: str | None
    doc_type: str | None
    answer: str
    abstained: bool
    citation_count: int
    citations: list[dict]
    latency_ms: int
    created_at: datetime


@router.get("/audit/queries", response_model=list[QueryLogEntry])
def list_queries(limit: int = 50):
    """Most recent audited queries, newest first."""
    limit = max(1, min(limit, 200))
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, operator, question, workstream, doc_type, answer, abstained,
                       citation_count, citations, latency_ms, created_at
                FROM query_log
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (limit,),
            )
            rows = cur.fetchall()
    finally:
        conn.close()
    return [
        QueryLogEntry(
            id=r[0], operator=r[1], question=r[2], workstream=r[3], doc_type=r[4], answer=r[5],
            abstained=r[6], citation_count=r[7], citations=r[8] or [], latency_ms=r[9], created_at=r[10],
        )
        for r in rows
    ]
