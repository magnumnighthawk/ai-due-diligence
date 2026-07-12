"""Block 2: typed extraction. Run targeted structured-output extraction over
the already-ingested chunks and load results into the `findings` table.

    .venv/bin/python3 ingest/run_extract.py
"""
import pathlib
import sys

from dotenv import load_dotenv

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from lib.db import get_conn
from lib.extract_findings import (
    extract_commercial_findings,
    extract_financial_findings,
    extract_operational_findings,
)

load_dotenv()


def main():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM findings")
        conn.commit()

        fin_ids = extract_financial_findings(conn, "udc-10k-fy2022")
        print(f"financial: {len(fin_ids)} findings")

        com_ids = extract_commercial_findings(conn, "udc-ex10.25-samsung-license")
        print(f"commercial: {len(com_ids)} findings")

        ops_ids = extract_operational_findings(conn, ["udc-8k-2022-08-04", "udc-8k-2022-08-04-ex99.1"])
        print(f"operational: {len(ops_ids)} findings")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
