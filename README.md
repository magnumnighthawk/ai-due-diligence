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
.venv/bin/python3 ingest/run_compose.py   # cross-reference: deterministic rules + LangGraph agent -> risks

cd api && ../.venv/bin/uvicorn app.main:app --reload
# in another shell
cd web && npm install && npm run dev
```

API health check: `http://localhost:8000/health`
Web: `http://localhost:3000`

The single-page UI is the trust feature: the **risk register** → click a risk → its **linked
findings** (with workstream + resolved entity) → click a finding → the **source document with the
cited char span highlighted** and scrolled into view. Endpoints: `GET /risks`, `GET /risks/{id}`
(with findings), `GET /documents/{id}` (raw text), `POST /ask` (grounded, cited Q&A).

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

### Cross-reference + risk composition (Block 3)

`ingest/lib/risk_rules.py` is the reliable floor: it groups entity-resolved findings by
`entity_id` and fires two deterministic rules.

- **Concentration × assignment.** If an entity has both a `customer_concentration` finding and an
  assignment/change-of-control `contract_clause`, emit one risk citing every related finding
  (including termination and term-expiry clauses as compounding evidence). Severity is High if
  either an exact disclosed percentage is ≥20%, *or* the certain facts alone compound enough
  (assignment rights + 2+ independent termination triggers + a fixed near-term expiry) --
  deliberately not dependent on guessing which anonymized concentration-table row belongs to the
  entity. This is what produces the money-shot risk: Samsung Display Co., Ltd. has only a
  disclosed ">10%" threshold (not an exact figure), but assignment-on-change-of-control + 3
  termination triggers + a Dec-2027 expiry is enough certain evidence on its own for High.
- **Personnel monitoring.** A senior-finance departure (the CFO retirement) is always emitted as
  its own standalone, Low-severity note -- never merged into a customer risk, since nothing in the
  corpus ties it to a specific relationship. Calibration (not flagging everything red) is
  deliberate, not an oversight.

`ingest/lib/risk_agent.py` is the exploratory ceiling: a real LangGraph graph
(`plan → gather → propose → self_check → emit`) that, per entity, gathers both entity-resolved
findings and *candidate* findings from the same source document that entity resolution declined to
auto-link (e.g. the anonymized "Customer A/B/C" table), and asks an LLM whether that candidate
evidence plausibly sharpens the risk enough to argue for higher severity than the rules engine's
conservative version -- always labeling anything inferred as inferred, and always landing in
`review_status = 'needs_review'` if it does emit something.

On this corpus, the agent's specific attempt -- "Customer A's 41% might be Samsung's true
concentration" -- gets correctly **rejected by its own self-check step**, which judged the
identity inference (SDC = "Customer A") as unsupported by the cited findings. `run_compose.py`
prints that rejection and its reason rather than silently dropping it: this is the safety
mechanism working as designed ("the agent can hallucinate a link... every agent-composed risk
still carries citations a human verifies"), not a failure to route around. The honest answer
here wasn't to keep prompt-engineering until the checker rubber-stamped a weak inference -- it
was to move the legitimately-certain compounding factors into the rules tier instead, which is
exactly the plan's own cut line: *"rules-only cross-referencing that works beats a flaky agent
every time."*

Verify the done-when condition:

```bash
docker compose exec db psql -U postgres -d diligence -c "
SELECT r.title, r.severity, r.source, array_agg(DISTINCT f.workstream), r.finding_ids
FROM risks r, unnest(r.finding_ids) fid JOIN findings f ON f.id = fid
GROUP BY r.id, r.title, r.severity, r.source, r.finding_ids;"
```

### Evaluation (Block 4)

Three cheap, high-signal evals under `eval/` (details and latest numbers in `eval/README.md`):

- **Extraction P/R** (`pytest`) — change-of-control detection scored against a held-out **CUAD**
  subset (real gold annotations, eval-only): **P=1.00, R=0.80, F1=0.89**. The recall misses are
  truncated CUAD spans — a measured, explainable failure, not a hidden one.
- **Citation faithfulness** (`pytest`) — every finding's cited span must contain its claim:
  span-containment **100%**, LLM-judge **93%**. The one miss is a real catch (a continuation
  mislabeled as an appointment).
- **Abstention** (`pytest` + **Promptfoo**) — unanswerable questions must return "insufficient
  evidence"; answerable ones must not. Promptfoo run: **5/5**.

```bash
.venv/bin/python3 -m pytest eval -s                    # extraction P/R, faithfulness, abstention
cd eval/promptfoo && npx promptfoo@0.121 eval -c promptfooconfig.yaml --no-cache   # Q&A via Promptfoo
```

One retrieval failure is kept deliberately (see `eval/README.md`): a query repeating the filer's
own name falsely abstains because `ts_rank` has no corpus IDF — walking through it is a stronger
signal than hiding it.
