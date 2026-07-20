"""Block 2: entity resolution. Link financial/commercial findings to
canonical entities (rapidfuzz + embedding threshold, alias-aware); anything
under threshold is routed to human review rather than auto-linked.

    .venv/bin/python3 ingest/run_resolve.py
"""
import pathlib
import sys

from dotenv import load_dotenv

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from lib.db import get_conn
from lib.entity_resolution import resolve_entities
from lib.timing import stage_timer

load_dotenv()


def main():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM entities")
        conn.commit()

        with stage_timer(conn, "resolve") as t:
            stats = resolve_entities(conn)
            t.item_count = stats.get("linked", 0) + stats.get("created", 0)
            t.detail = stats
        print(stats)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
