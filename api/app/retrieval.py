import re
from dataclasses import dataclass

import psycopg
from pgvector import Vector

from .embed import embed_query

RRF_K = 60
CANDIDATE_LIMIT = 50


def _or_tsquery(query: str) -> str:
    """Turn a natural-language question into an OR-of-terms websearch query.

    plainto_tsquery ANDs every term, so a question like "what is Universal
    Display customer concentration?" matches nothing unless a single chunk
    contains ALL of those words -- losing the keyword arm of hybrid retrieval
    entirely. OR semantics let any term contribute and lets ts_rank order by
    how many/how well terms match. (Note: ts_rank still has no corpus IDF, so
    a ubiquitous term like the filer's own name can over-rank boilerplate --
    a known limitation demonstrated in the eval harness.)
    """
    terms = re.findall(r"[A-Za-z0-9]+", query)
    return " OR ".join(terms) if terms else query


@dataclass
class RetrievedChunk:
    id: int
    doc_id: str
    doc_title: str
    section: str
    char_start: int
    char_end: int
    text: str
    score: float


_VECTOR_SQL = """
    SELECT c.id, c.doc_id, d.title, c.section, c.char_start, c.char_end, c.text
    FROM chunks c
    JOIN documents d ON d.id = c.doc_id
    WHERE (%(workstream)s::text IS NULL OR d.workstream = %(workstream)s::text)
      AND (%(doc_type)s::text IS NULL OR d.doc_type = %(doc_type)s::text)
    ORDER BY c.embedding <=> %(query_vec)s
    LIMIT %(n)s
"""

_FTS_SQL = """
    SELECT c.id, c.doc_id, d.title, c.section, c.char_start, c.char_end, c.text
    FROM chunks c
    JOIN documents d ON d.id = c.doc_id
    WHERE c.tsv @@ websearch_to_tsquery('english', %(or_query)s)
      AND (%(workstream)s::text IS NULL OR d.workstream = %(workstream)s::text)
      AND (%(doc_type)s::text IS NULL OR d.doc_type = %(doc_type)s::text)
    ORDER BY ts_rank(c.tsv, websearch_to_tsquery('english', %(or_query)s)) DESC
    LIMIT %(n)s
"""


def hybrid_search(
    conn: psycopg.Connection,
    query: str,
    workstream: str | None = None,
    doc_type: str | None = None,
    top_k: int = 8,
) -> list[RetrievedChunk]:
    query_vec = Vector(embed_query(query))
    params = {
        "query": query,
        "or_query": _or_tsquery(query),
        "query_vec": query_vec,
        "workstream": workstream,
        "doc_type": doc_type,
        "n": CANDIDATE_LIMIT,
    }

    with conn.cursor() as cur:
        cur.execute(_VECTOR_SQL, params)
        vector_rows = cur.fetchall()
        cur.execute(_FTS_SQL, params)
        fts_rows = cur.fetchall()

    # Reciprocal Rank Fusion: score = sum(1 / (k + rank)) across each ranked list
    fused: dict[int, float] = {}
    rows_by_id: dict[int, tuple] = {}
    for rows in (vector_rows, fts_rows):
        for rank, row in enumerate(rows, start=1):
            chunk_id = row[0]
            rows_by_id[chunk_id] = row
            fused[chunk_id] = fused.get(chunk_id, 0.0) + 1.0 / (RRF_K + rank)

    ranked_ids = sorted(fused, key=lambda cid: fused[cid], reverse=True)[:top_k]
    return [
        RetrievedChunk(
            id=cid,
            doc_id=rows_by_id[cid][1],
            doc_title=rows_by_id[cid][2],
            section=rows_by_id[cid][3],
            char_start=rows_by_id[cid][4],
            char_end=rows_by_id[cid][5],
            text=rows_by_id[cid][6],
            score=fused[cid],
        )
        for cid in ranked_ids
    ]
