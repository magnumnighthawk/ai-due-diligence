"""Print the end-to-end diligence cycle time from the most recent run of
each pipeline stage. This is the concrete, measured version of the brief's
headline "reduced diligence cycle time" success metric.

    .venv/bin/python3 ingest/report_timing.py
"""
import pathlib
import sys

from dotenv import load_dotenv

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from lib.db import get_conn

load_dotenv()

STAGES = ["ingest", "extract", "resolve", "compose"]


def main():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # Latest run per stage.
            cur.execute(
                """
                SELECT DISTINCT ON (stage) stage, duration_ms, doc_count, item_count, finished_at
                FROM pipeline_runs
                ORDER BY stage, finished_at DESC
                """
            )
            rows = {r[0]: r for r in cur.fetchall()}
    finally:
        conn.close()

    if not rows:
        print("No pipeline runs recorded yet. Run the ingest -> compose pipeline first.")
        return

    print(f"{'stage':<10} {'duration':>12} {'docs':>6} {'items':>7}")
    print("-" * 40)
    total_ms = 0
    for stage in STAGES:
        r = rows.get(stage)
        if r is None:
            print(f"{stage:<10} {'(not run)':>12}")
            continue
        _, duration_ms, doc_count, item_count, _ = r
        total_ms += duration_ms
        print(f"{stage:<10} {duration_ms/1000:>10.2f}s {doc_count if doc_count is not None else '-':>6} {item_count if item_count is not None else '-':>7}")
    print("-" * 40)
    print(f"{'TOTAL':<10} {total_ms/1000:>10.2f}s  end-to-end cycle time")


if __name__ == "__main__":
    main()
