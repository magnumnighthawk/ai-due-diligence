import json
import os
from dataclasses import dataclass

import psycopg
from openai import OpenAI

from .schemas import (
    ContractClause,
    ContractClauseExtraction,
    CustomerConcentration,
    CustomerConcentrationExtraction,
    PersonnelEvent,
    PersonnelEventExtraction,
)

EXTRACTION_MODEL = "gpt-4o-mini"

_client = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client


@dataclass
class SourceChunk:
    id: int
    doc_id: str
    section: str
    char_start: int
    char_end: int
    text: str


def fetch_chunks(conn: psycopg.Connection, doc_ids: list[str], keyword_sql: str) -> list[SourceChunk]:
    """Targeted extraction: pull only chunks classified as relevant to a
    finding type (by document + keyword/heading match) rather than running
    extraction blind over the whole corpus. `keyword_sql` is a fixed,
    developer-authored predicate (not user input); doc_ids are passed as
    real bind parameters."""
    placeholders = ",".join(["%s"] * len(doc_ids))
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT id, doc_id, section, char_start, char_end, text
            FROM chunks
            WHERE doc_id IN ({placeholders}) AND ({keyword_sql})
            ORDER BY char_start
            """,
            doc_ids,
        )
        return [SourceChunk(*row) for row in cur.fetchall()]


def _build_excerpts(chunks: list[SourceChunk]) -> str:
    return "\n\n".join(f"[{i}] (section: {c.section})\n{c.text}" for i, c in enumerate(chunks, start=1))


def _extract(chunks: list[SourceChunk], wrapper_cls, instructions: str):
    if not chunks:
        return []
    excerpts = _build_excerpts(chunks)
    resp = _get_client().chat.completions.parse(
        model=EXTRACTION_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "You extract structured findings from due-diligence document excerpts. "
                    "Only extract facts explicitly stated in the excerpts -- never infer or guess a "
                    "fact that isn't written there (e.g. don't map an anonymized customer label to a "
                    "real company name unless the excerpts state that mapping directly). "
                    "Every finding must include source_index, the [N] excerpt it was drawn from.\n\n"
                    + instructions
                ),
            },
            {"role": "user", "content": excerpts},
        ],
        response_format=wrapper_cls,
        temperature=0,
    )
    return resp.choices[0].message.parsed.findings


def _resolve_span(chunks: list[SourceChunk], source_index: int) -> tuple[str, int, int]:
    chunk = chunks[source_index - 1]
    return chunk.doc_id, chunk.char_start, chunk.char_end


def _insert_finding(
    conn: psycopg.Connection, workstream: str, kind: str, payload: dict, doc_id: str, char_start: int, char_end: int, confidence: float
) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO findings (workstream, kind, payload, doc_id, char_start, char_end, confidence, review_status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'auto')
            RETURNING id
            """,
            (workstream, kind, json.dumps(payload), doc_id, char_start, char_end, confidence),
        )
        return cur.fetchone()[0]


CONCENTRATION_INSTRUCTIONS = """
Extract one CustomerConcentration finding per customer whose revenue share is disclosed,
including when several named customers share one disclosed threshold, e.g. "revenue from
three customers, X, Y and Z, from each of which we had revenue in excess of 10%" is THREE
findings (X, Y, and Z), each with pct_revenue_threshold="in excess of 10%" and pct_revenue null
-- do not skip these just because no exact percentage is given per name.

If the excerpt gives an exact percentage instead, put it in pct_revenue and leave
pct_revenue_threshold null. If a table anonymizes customers as "Customer A/B/C", extract each
with that literal label as customer_name -- do not guess which named company (if any) it
corresponds to, even if another excerpt names customers elsewhere.
"""

CLAUSE_INSTRUCTIONS = """
Extract one ContractClause finding per distinct clause about: assignment / change of control,
termination (for breach, insolvency, or otherwise), exclusivity, or the agreement's term/expiry
date. Skip boilerplate (notices, counterparts, severability) unless it materially affects
assignability or termination.
"""

PERSONNEL_INSTRUCTIONS = """
Extract one PersonnelEvent per executive or director departure or appointment. Use "departure" for
retirements/resignations/terminations and "appointment" for new roles, including a same-person
transition (e.g. retiring from one role while continuing in another) as two separate findings if
both are stated.
"""


def extract_financial_findings(conn: psycopg.Connection, doc_id: str) -> list[int]:
    chunks = fetch_chunks(
        conn,
        [doc_id],
        "text ILIKE '%%concentration%%' OR text ILIKE '%%%% of Total Revenue%%' "
        "OR text ILIKE '%%in excess of%%revenue%%' OR text ILIKE '%%majority of our revenue%%'",
    )
    findings: list[CustomerConcentration] = _extract(chunks, CustomerConcentrationExtraction, CONCENTRATION_INSTRUCTIONS)
    ids = []
    for f in findings:
        doc_id_, start, end = _resolve_span(chunks, f.source_index)
        confidence = 0.95 if f.pct_revenue is not None else 0.75
        payload = f.model_dump(exclude={"source_index"})
        ids.append(_insert_finding(conn, "financial", "customer_concentration", payload, doc_id_, start, end, confidence))
    conn.commit()
    return ids


def extract_commercial_findings(conn: psycopg.Connection, doc_id: str) -> list[int]:
    chunks = fetch_chunks(
        conn,
        [doc_id],
        "text ILIKE '%%assign%%' OR text ILIKE '%%terminat%%' OR text ILIKE '%%change of control%%' "
        "OR text ILIKE '%%insolven%%' OR section ILIKE '%%term%%'",
    )
    findings: list[ContractClause] = _extract(chunks, ContractClauseExtraction, CLAUSE_INSTRUCTIONS)
    ids = []
    for f in findings:
        doc_id_, start, end = _resolve_span(chunks, f.source_index)
        payload = f.model_dump(exclude={"source_index"})
        ids.append(_insert_finding(conn, "commercial", "contract_clause", payload, doc_id_, start, end, 0.9))
    conn.commit()
    return ids


def extract_operational_findings(conn: psycopg.Connection, doc_ids: list[str]) -> list[int]:
    chunks = fetch_chunks(
        conn,
        doc_ids,
        "text ILIKE '%%retire%%' OR text ILIKE '%%appoint%%' OR text ILIKE '%%resign%%' OR section ILIKE '%%5.02%%'",
    )
    findings: list[PersonnelEvent] = _extract(chunks, PersonnelEventExtraction, PERSONNEL_INSTRUCTIONS)
    ids = []
    for f in findings:
        doc_id_, start, end = _resolve_span(chunks, f.source_index)
        payload = f.model_dump(exclude={"source_index"})
        ids.append(_insert_finding(conn, "operational", "personnel_event", payload, doc_id_, start, end, 0.9))
    conn.commit()
    return ids
