# ingest: the diligence pipeline

Four stages turn raw deal-room documents into cited, cross-workstream risks. Run them in order from
the repo root. Each one is safe to re-run.

| Stage | Script | Output table | What it does |
|---|---|---|---|
| 1 | `run_ingest.py` | `documents`, `chunks` | Parse HTML, chunk by section, embed |
| 2 | `run_extract.py` | `findings` | Typed, structured-output LLM extraction with character-span citations |
| 3 | `run_resolve.py` | `entities` | Link findings to canonical entities (alias-aware, fuzzy matching plus embeddings) |
| 4 | `run_compose.py` | `risks` | Deterministic cross-reference rules, then an exploratory LangGraph agent |

`report_timing.py` prints the measured wall-clock time of the latest run of each stage. The API
serves the same data at `/metrics/pipeline`.

## 1. Chunking

`lib/chunk.py` is deliberately not tied to any one document type (10-K, NDA, purchase agreement).
It finds section boundaries from generic structural signals: numbered, lettered or roman headings;
the keywords "Item", "Article" and "Section"; ALL-CAPS lines; and bold or `<h1-6>` HTML styling.
That way it handles the mix of filings and Word-exported contracts a real data room contains, not
just SEC filings.

- Text inside `<table>` is never treated as a heading candidate. Otherwise financial tables break
  apart into bogus "sections".
- Inline-XBRL header and hidden blocks are stripped before chunking. They are machine-only metadata
  and would fill embedding search with raw concept-name text.

## 2. Typed extraction

`lib/extract_findings.py` runs targeted extraction rather than blind whole-document extraction.
Pydantic schemas live in `lib/schemas.py`. Each finding type only runs over chunks pre-selected by
document and keywords:

- concentration language in the 10-K → `CustomerConcentration`
- assignment, change-of-control, termination, exclusivity and term-expiry clauses in the licence →
  `ContractClause`
- departure and appointment language in the 8-K → `PersonnelEvent`

Each finding keeps a `source_index` back to the excerpt it came from. That index resolves to the
chunk's real `char_start`/`char_end` in `documents.raw_text`, which is what the UI highlights.

## 3. Entity resolution

`lib/entity_resolution.py` links `customer_name` and `counterparty` mentions to canonical `entities`
rows using rapidfuzz plus embedding cosine similarity. Three lessons from this corpus shaped it:

- **Abbreviations don't match their full names.** On this corpus, "SDC" scores about 7/100 against
  "Samsung Display Co., Ltd." on `token_set_ratio`, and about 0.30 cosine similarity. These
  documents define abbreviations in parentheses on first use (`Samsung Display Co., Ltd. ("SDC")`).
  A regex mines that convention into an alias map, so "SDC" resolves to the full name *before*
  fuzzy or embedding matching, and nothing has to invent the mapping. This is what lets the
  concentration finding and the licence clauses land on the same entity.
- **Token-set scoring produced a false link.** "LG Display" scored 82/100 against "Samsung Display
  Co., Ltd." only because both contain the token "Display". Plain whole-string `fuzz.ratio`
  separates that case (46) cleanly from real near-duplicates (93–100).
- **Unresolvable mentions go to a human.** Mentions shorter than 3 characters, like the 10-K's
  anonymised "Customer A/B/C" table, are never auto-linked and never seed a new entity. They are set
  to `review_status = 'needs_review'`, because a false link in a risk register is worse than a
  missing one.

Check the cross-workstream link:

```bash
docker compose exec db psql -U postgres -d diligence -c "
SELECT e.canonical_name, array_agg(DISTINCT f.workstream), count(*)
FROM findings f JOIN entities e ON e.id = f.entity_id
GROUP BY e.canonical_name HAVING count(DISTINCT f.workstream) > 1;"
```

You should see `Samsung Display Co., Ltd.` linked from both `financial` (concentration) and
`commercial` (licence clauses).

## 4. Risk composition: rules floor, agent ceiling

**`lib/risk_rules.py` is the reliable floor.** It groups entity-resolved findings by entity and
applies two deterministic rules:

- **Concentration × assignment.** If an entity has both a customer-concentration finding and an
  assignment or change-of-control clause, it emits one risk that cites every related finding.
  Termination and expiry clauses count as compounding evidence. Severity scales to the deal's
  materiality (`lib/deal_context.py`): revenue at risk is the concentration % times the target's
  revenue, compared against the deal's own bands. The combination is at least **Medium**. It
  becomes **High** when the concentration alone is material, or when certain contract facts
  compound: assignment rights, 2 or more termination triggers, and a fixed expiry. That deliberately
  avoids guessing which anonymised table row belongs to the entity. On this corpus Samsung Display
  only has a disclosed ">10%" threshold, but assignment on change of control, plus three termination
  triggers, plus a December 2027 expiry, is enough certain evidence for High.
- **Personnel monitoring.** A senior-finance departure (the CFO retirement) is always a standalone,
  **Low** note. It is never merged into a customer risk, because nothing in the corpus ties it to
  one. The calibration is deliberate.

**`lib/risk_agent.py` is the exploratory ceiling.** It is a LangGraph graph
(`plan → gather → propose → self_check → emit`). For each entity, it gathers the resolved findings
and also *candidate* findings from the same document that resolution declined to link. It then asks
whether that candidate evidence justifies a higher severity than the rules gave. Anything inferred
is labelled as inferred, and anything emitted is set to `needs_review`.

On this corpus the agent tries the inference *"Customer A's 41% might be Samsung's true
concentration."* Its own self-check **rejects** it, because the identity link (SDC = "Customer A")
isn't supported by the cited findings. `run_compose.py` prints that rejection and its reason
instead of dropping it silently. That is the safety mechanism working as designed. The fix wasn't to
keep tuning prompts until the checker approved a weak inference. It was to move the facts that
really are certain into the rules tier. Rules-only cross-referencing that works beats a flaky agent.

Inspect the composed risks:

```bash
docker compose exec db psql -U postgres -d diligence -c "
SELECT r.title, r.severity, r.source, array_agg(DISTINCT f.workstream), r.finding_ids
FROM risks r, unnest(r.finding_ids) fid JOIN findings f ON f.id = fid
GROUP BY r.id, r.title, r.severity, r.source, r.finding_ids;"
```

## Using your own documents

1. Put HTML files in `data/raw/` and add entries to the document list in `run_ingest.py` (id,
   doc_type, workstream, title, source_url).
2. Pass the new document ids to the `extract_*_findings` calls in `run_extract.py`, and adjust the
   keyword pre-filters in `lib/extract_findings.py` if your documents use different wording.
3. Set the deal's revenue band and materiality thresholds in `lib/deal_context.py`.
