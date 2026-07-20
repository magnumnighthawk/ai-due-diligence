-- Migration 002: reviewer workflow, query audit log, pipeline timing.
-- Idempotent (safe to re-run) so it can be applied to an already-seeded DB
-- without a rebuild. The canonical fresh-install schema in db/schema.sql
-- carries the same definitions.

-- --- Feature 1: reviewer confirm/dismiss workflow -----------------------
-- Current review state is denormalised onto the item for easy display;
-- the immutable who/when/why history lives in review_events.
ALTER TABLE findings ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS review_note TEXT;

ALTER TABLE risks ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS review_note TEXT;

-- One immutable row per human review action -- the audit trail the brief's
-- "review checkpoints and escalation paths" requires.
CREATE TABLE IF NOT EXISTS review_events (
  id BIGSERIAL PRIMARY KEY,
  target_type TEXT NOT NULL,      -- 'finding' | 'risk'
  target_id BIGINT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,        -- 'confirmed' | 'dismissed'
  reviewer TEXT NOT NULL,         -- who (auth identity would populate this in prod)
  note TEXT,                      -- why
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()  -- when
);
CREATE INDEX IF NOT EXISTS review_events_target_idx ON review_events (target_type, target_id);

-- --- Feature 4: query / answer audit log --------------------------------
-- Every /ask records the question, the answer, and exactly which source
-- spans were surfaced -- so any answer shown to a reviewer is reconstructable.
CREATE TABLE IF NOT EXISTS query_log (
  id BIGSERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  workstream TEXT,
  doc_type TEXT,
  answer TEXT,
  abstained BOOLEAN,
  citation_count INT,
  citations JSONB,                -- surfaced citations: marker, doc_id, section, char span
  latency_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --- Feature 3: pipeline-timing instrumentation -------------------------
-- One row per pipeline stage run; report_timing sums the latest of each
-- stage into an end-to-end cycle time (the "reduced cycle time" metric).
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id BIGSERIAL PRIMARY KEY,
  batch_id TEXT,                  -- groups stages from one invocation
  stage TEXT NOT NULL,            -- 'ingest' | 'extract' | 'resolve' | 'compose'
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  duration_ms INT NOT NULL,
  doc_count INT,
  item_count INT,                 -- chunks / findings / entities / risks produced
  detail JSONB
);
CREATE INDEX IF NOT EXISTS pipeline_runs_stage_idx ON pipeline_runs (stage, finished_at DESC);
