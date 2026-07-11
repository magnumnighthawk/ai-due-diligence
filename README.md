# AI Due Diligence Acceleration

Cross-workstream risk radar over a surrogate deal room built from real SEC filings.

## Layout

- `api/` — FastAPI backend
- `web/` — Next.js UI
- `ingest/` — fetch/parse/chunk/embed scripts
- `eval/` — pytest + Promptfoo eval harness
- `db/schema.sql` — Postgres + pgvector schema, applied automatically on first `docker compose up`

## Setup

```bash
cp .env.example .env   # fill in OPENAI_API_KEY (or ANTHROPIC_API_KEY)

docker compose up -d   # Postgres + pgvector, schema applied on first boot

cd api && pip install -r requirements.txt && uvicorn app.main:app --reload
# in another shell
cd web && npm install && npm run dev
```

API health check: `http://localhost:8000/health`
Web: `http://localhost:3000`
