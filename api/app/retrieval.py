from dataclasses import dataclass

import psycopg
from pgvector import Vector

from .embed import embed_query

RRF_K = 60
CANDIDATE_LIMIT = 50


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
    WHERE c.tsv @@ plainto_tsquery('english', %(query)s)
      AND (%(workstream)s::text IS NULL OR d.workstream = %(workstream)s::text)
      AND (%(doc_type)s::text IS NULL OR d.doc_type = %(doc_type)s::text)
    ORDER BY ts_rank(c.tsv, plainto_tsquery('english', %(query)s)) DESC
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
