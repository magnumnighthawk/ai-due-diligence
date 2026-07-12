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

python3 -m venv .venv && .venv/bin/pip install -r api/requirements.txt

.venv/bin/python3 ingest/run_ingest.py   # parse, chunk, embed, load the surrogate deal room

cd api && ../.venv/bin/uvicorn app.main:app --reload
# in another shell
cd web && npm install && npm run dev
```

API health check: `http://localhost:8000/health`
Web: `http://localhost:3000`

## Surrogate deal room: Universal Display Corporation (OLED, CIK 1005284)

`ingest/run_ingest.py` loads four real UDC filings (already saved under `ingest/data/raw/` so
the demo runs offline without hitting EDGAR):

- FY2022 10-K (financial) — customer concentration (Note 19; Item 1A names Samsung Display/LG Display/BOE)
- Exhibit 10.25, OLED Patent License Agreement with Samsung Display (commercial) — Section 9.3
  Non-Assignment is the change-of-control clause
- 8-K, Aug 4 2022, Item 5.02 + press release exhibit (operational) — CFO retirement

Ask a grounded, cited question once the API is running:

```bash
curl -s -X POST http://localhost:8000/ask -H "Content-Type: application/json" \
  -d '{"question": "what is the customer concentration?"}'
```

### Chunking approach

`ingest/lib/chunk.py` is deliberately not keyed to any one document type (10-K vs. NDA vs.
purchase agreement). It detects section boundaries from generic structural signals -- numbered/
lettered/roman headings, "Item"/"Article"/"Section" keywords, ALL-CAPS lines, and bold/`<h1-6>`
HTML styling -- so it generalizes to the mix of filings and Word-exported contracts a real VDR
would contain, rather than only the SEC filings used for this demo. Text inside `<table>` tags is
never treated as a heading candidate (financial tables shred into bogus "sections" otherwise), and
inline-XBRL header/hidden blocks are stripped before chunking since they're machine-only metadata
that would otherwise pollute embedding search with raw concept-name text.
