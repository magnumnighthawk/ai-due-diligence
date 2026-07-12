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

.venv/bin/python3 ingest/run_ingest.py    # parse, chunk, embed, load the surrogate deal room
.venv/bin/python3 ingest/run_extract.py   # typed findings via structured-output LLM extraction
.venv/bin/python3 ingest/run_resolve.py   # entity resolution: link findings to canonical entities

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

### Typed extraction + entity resolution (Block 2)

`ingest/lib/extract_findings.py` runs targeted structured-output extraction (Pydantic schemas in
`ingest/lib/schemas.py`) over chunks pre-classified by document + keyword match per finding type --
concentration language in the 10-K, assignment/termination/exclusivity clauses in the license
exhibit, retirement/appointment language in the 8-K -- rather than blind whole-document extraction.
Each finding keeps a `source_index` back to the excerpt it was drawn from, resolved to that chunk's
real `char_start`/`char_end` in `documents.raw_text`.

`ingest/lib/entity_resolution.py` links `customer_name`/`counterparty` mentions to canonical
`entities` rows using rapidfuzz + embedding cosine similarity, with two things worth knowing:

- **Bare abbreviations don't fuzzy/embedding-match their full name well** -- measured on this
  corpus, "SDC" vs. "Samsung Display Co., Ltd." scores ~7/100 on token_set_ratio and ~0.30 cosine
  similarity. Since these documents define abbreviations parenthetically on first use
  (`Samsung Display Co., Ltd. ("SDC")`), a regex mines that convention into an alias map and
  resolves "SDC" to the full name *before* fuzzy/embedding matching, rather than fabricating the
  mapping. This is what actually makes the concentration finding and the license-agreement clauses
  land on the same canonical entity.
- **token_set_ratio/partial_ratio produced a false link** -- "LG Display" scored 82/100 against
  "Samsung Display Co., Ltd." purely because both share the generic token "Display". Switched to
  plain `fuzz.ratio` (whole-string, case-insensitive), which separates that case (46) from real
  near-duplicates (93-100) cleanly.
- Mentions shorter than 3 characters (the 10-K's anonymized "Customer A/B/C" concentration table)
  are never auto-linked or used to seed a new canonical entity -- they always route to
  `review_status = 'needs_review'`, since there's no reliable signal to resolve them and a false
  link in a risk register is worse than a missing one.

Verify the result:

```bash
docker compose exec db psql -U postgres -d diligence -c "
SELECT e.canonical_name, array_agg(DISTINCT f.workstream), count(*)
FROM findings f JOIN entities e ON e.id = f.entity_id
GROUP BY e.canonical_name HAVING count(DISTINCT f.workstream) > 1;"
```

This should show `Samsung Display Co., Ltd.` linked from both `financial` (the concentration
finding) and `commercial` (the license agreement's assignment/termination/term-expiry clauses) --
the cross-workstream finding no single workstream would catch on its own.
