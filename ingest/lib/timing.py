"""Pipeline-timing instrumentation. Each pipeline stage (ingest, extract,
resolve, compose) records its wall-clock duration and output counts to the
pipeline_runs table, so the end-to-end diligence *cycle time* -- the brief's
headline success metric -- is measured, not asserted.

Usage:

    with stage_timer(conn, "extract", doc_count=4) as t:
        ... do the work ...
        t.item_count = len(findings)
        t.detail = {"financial": n1, "commercial": n2}
"""
import time
import uuid
from datetime import datetime, timezone
from types import TracebackType

import psycopg
from psycopg.types.json import Json

# One batch_id per process invocation groups a stage with its siblings when
# several stages are run from the same script.
_BATCH_ID = uuid.uuid4().hex[:12]


class StageTimer:
    def __init__(self, conn: psycopg.Connection, stage: str, doc_count: int | None = None):
        self.conn = conn
        self.stage = stage
        self.doc_count = doc_count
        self.item_count: int | None = None
        self.detail: dict | None = None
        self._start_perf = 0.0
        self._start_at: datetime | None = None

    def __enter__(self) -> "StageTimer":
        self._start_perf = time.perf_counter()
        self._start_at = datetime.now(timezone.utc)
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> bool:
        # Only record a clean run -- a stage that raised didn't produce a
        # meaningful duration to compare against.
        if exc_type is not None:
            return False
        duration_ms = int((time.perf_counter() - self._start_perf) * 1000)
        finished_at = datetime.now(timezone.utc)
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO pipeline_runs
                    (batch_id, stage, started_at, finished_at, duration_ms, doc_count, item_count, detail)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    _BATCH_ID,
                    self.stage,
                    self._start_at,
                    finished_at,
                    duration_ms,
                    self.doc_count,
                    self.item_count,
                    Json(self.detail) if self.detail is not None else None,
                ),
            )
        self.conn.commit()
        print(f"[timing] {self.stage}: {duration_ms} ms" + (f" ({self.item_count} items)" if self.item_count is not None else ""))
        return False


def stage_timer(conn: psycopg.Connection, stage: str, doc_count: int | None = None) -> StageTimer:
    return StageTimer(conn, stage, doc_count=doc_count)
