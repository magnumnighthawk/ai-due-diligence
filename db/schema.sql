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
  review_status TEXT DEFAULT 'auto'
);

CREATE TABLE risks (
  id BIGSERIAL PRIMARY KEY,
  title TEXT,
  severity TEXT,
  rationale TEXT,
  source TEXT,
  finding_ids BIGINT[],
  review_status TEXT DEFAULT 'auto'
);
