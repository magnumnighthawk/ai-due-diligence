CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  doc_type TEXT,
  workstream TEXT,
  title TEXT,
  source_url TEXT,
  raw_text TEXT
);

CREATE TABLE chunks (
  id BIGSERIAL PRIMARY KEY,
  doc_id TEXT REFERENCES documents(id),
  section TEXT,
  char_start INT,
  char_end INT,
  text TEXT,
  embedding vector(1536),
  tsv tsvector
);

CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON chunks USING gin (tsv);

CREATE TABLE entities (
  id BIGSERIAL PRIMARY KEY,
  canonical_name TEXT,
  kind TEXT
);

CREATE TABLE findings (
  id BIGSERIAL PRIMARY KEY,
  workstream TEXT,
  kind TEXT,
  payload JSONB,
  entity_id BIGINT,
  doc_id TEXT,
  char_start INT,
  char_end INT,
  confidence REAL,
  review_status TEXT DEFAULT 'auto',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT
);

CREATE TABLE risks (
  id BIGSERIAL PRIMARY KEY,
  title TEXT,
  severity TEXT,
  rationale TEXT,
  source TEXT,
  finding_ids BIGINT[],
  review_status TEXT DEFAULT 'auto',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT
);

-- Immutable who/when/why audit trail for reviewer confirm/dismiss actions.
CREATE TABLE review_events (
  id BIGSERIAL PRIMARY KEY,
  target_type TEXT NOT NULL,      -- 'finding' | 'risk'
  target_id BIGINT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,        -- 'confirmed' | 'dismissed'
  reviewer TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON review_events (target_type, target_id);

-- Query/answer audit log: every /ask, with the exact citations surfaced.
CREATE TABLE query_log (
  id BIGSERIAL PRIMARY KEY,
  operator TEXT,                   -- who ran the query (auth identity in prod)
  question TEXT NOT NULL,
  workstream TEXT,
  doc_type TEXT,
  answer TEXT,
  abstained BOOLEAN,
  citation_count INT,
  citations JSONB,
  latency_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pipeline stage timings -> end-to-end diligence cycle time.
CREATE TABLE pipeline_runs (
  id BIGSERIAL PRIMARY KEY,
  batch_id TEXT,
  stage TEXT NOT NULL,            -- 'ingest' | 'extract' | 'resolve' | 'compose'
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  duration_ms INT NOT NULL,
  doc_count INT,
  item_count INT,
  detail JSONB
);
CREATE INDEX ON pipeline_runs (stage, finished_at DESC);
