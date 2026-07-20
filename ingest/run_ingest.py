"""Ingest the UDC surrogate deal room: fetch (if needed) -> parse -> chunk ->
embed -> load into Postgres. Run from the repo root:

    .venv/bin/python3 ingest/run_ingest.py
"""
import pathlib
import sys

from dotenv import load_dotenv

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from lib.chunk import chunk_lines
from lib.db import get_conn
from lib.embed import embed_texts
from lib.extract import html_to_lines, lines_to_text
from lib.timing import stage_timer

load_dotenv()

RAW_DIR = pathlib.Path(__file__).parent / "data" / "raw"

DOCS = [
    {
        "id": "udc-10k-fy2022",
        "doc_type": "10-K",
        "workstream": "financial",
        "title": "Universal Display Corporation FY2022 10-K",
        "source_url": "https://www.sec.gov/Archives/edgar/data/1005284/000095017023004086/oled-20221231.htm",
        "file": "10k_oled-20221231.htm",
    },
    {
        "id": "udc-ex10.25-samsung-license",
        "doc_type": "contract",
        "workstream": "commercial",
        "title": "Exhibit 10.25 -- OLED Patent License Agreement (UDC Ireland / Samsung Display)",
        "source_url": "https://www.sec.gov/Archives/edgar/data/1005284/000095017023004086/oled-ex10_25.htm",
        "file": "ex10_25_samsung_license.htm",
    },
    {
        "id": "udc-8k-2022-08-04",
        "doc_type": "8-K",
        "workstream": "operational",
        "title": "8-K, Aug 4 2022 -- CFO retirement (Item 5.02)",
        "source_url": "https://www.sec.gov/Archives/edgar/data/1005284/000095017022014781/oled-20220804.htm",
        "file": "8k_oled-20220804.htm",
    },
    {
        "id": "udc-8k-2022-08-04-ex99.1",
        "doc_type": "press_release",
        "workstream": "operational",
        "title": "Exhibit 99.1 -- Q2 2022 earnings press release (CFO transition detail)",
        "source_url": "https://www.sec.gov/Archives/edgar/data/1005284/000095017022014781/oled-ex99_1.htm",
        "file": "8k_ex99_1_press_release.htm",
    },
]


def ingest_document(conn, doc: dict) -> int:
    html = (RAW_DIR / doc["file"]).read_text(encoding="utf-8", errors="ignore")
    lines = html_to_lines(html)
    raw_text = lines_to_text(lines)
    chunks = chunk_lines(lines)

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO documents (id, doc_type, workstream, title, source_url, raw_text)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                doc_type = EXCLUDED.doc_type, workstream = EXCLUDED.workstream,
                title = EXCLUDED.title, source_url = EXCLUDED.source_url, raw_text = EXCLUDED.raw_text
            """,
            (doc["id"], doc["doc_type"], doc["workstream"], doc["title"], doc["source_url"], raw_text),
        )
        cur.execute("DELETE FROM chunks WHERE doc_id = %s", (doc["id"],))

    embeddings = embed_texts([c.text for c in chunks])

    with conn.cursor() as cur:
        for chunk, embedding in zip(chunks, embeddings):
            cur.execute(
                """
                INSERT INTO chunks (doc_id, section, char_start, char_end, text, embedding, tsv)
                VALUES (%s, %s, %s, %s, %s, %s, to_tsvector('english', %s))
                """,
                (doc["id"], chunk.section, chunk.char_start, chunk.char_end, chunk.text, embedding, chunk.text),
            )
    conn.commit()
    return len(chunks)


def main():
    conn = get_conn()
    try:
        with stage_timer(conn, "ingest", doc_count=len(DOCS)) as t:
            total_chunks = 0
            for doc in DOCS:
                n = ingest_document(conn, doc)
                total_chunks += n
                print(f"{doc['id']}: {n} chunks")
            t.item_count = total_chunks
    finally:
        conn.close()


if __name__ == "__main__":
    main()
