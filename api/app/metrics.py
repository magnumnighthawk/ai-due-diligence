from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel

from .db import get_conn

router = APIRouter()

_STAGES = ["ingest", "extract", "resolve", "compose"]


class StageTiming(BaseModel):
    stage: str
    duration_ms: int
    doc_count: int | None
    item_count: int | None
    finished_at: datetime


class PipelineTiming(BaseModel):
    stages: list[StageTiming]
    total_ms: int


@router.get("/metrics/pipeline", response_model=PipelineTiming)
def pipeline_timing():
    """The measured end-to-end diligence cycle time: the most recent run of
    each pipeline stage, plus their sum. Backs the headline
    'reduced diligence cycle time' success metric with a real number."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT ON (stage) stage, duration_ms, doc_count, item_count, finished_at
                FROM pipeline_runs
                ORDER BY stage, finished_at DESC
                """
            )
            by_stage = {r[0]: r for r in cur.fetchall()}
    finally:
        conn.close()

    stages = [
        StageTiming(stage=s, duration_ms=r[1], doc_count=r[2], item_count=r[3], finished_at=r[4])
        for s in _STAGES
        if (r := by_stage.get(s)) is not None
    ]
    total_ms = sum(s.duration_ms for s in stages)
    return PipelineTiming(stages=stages, total_ms=total_ms)
