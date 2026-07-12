# eval

Cheap, high-signal evaluation of the three trust-critical behaviours.

```bash
# extraction P/R + citation faithfulness + abstention (needs the DB up and populated)
.venv/bin/python3 -m pytest eval -s

# Q&A grounding + abstention through Promptfoo, against the live API
#   (start the API first: uvicorn app.main:app from api/)
cd eval/promptfoo && npx promptfoo@0.121 eval -c promptfooconfig.yaml --no-cache
```

## What each measures

| Eval | File | Signal |
|---|---|---|
| **Extraction P/R** | `test_extraction.py` | Change-of-control detection scored against a held-out **CUAD** subset (real gold annotations). Latest run: **P=1.00, R=0.80, F1=0.89** — the 5 recall misses are all truncated/context-only CUAD spans that lost their change-of-control language, a real annotation artifact worth walking through. |
| **Citation faithfulness** | `test_faithfulness.py` | Does each finding's cited span actually contain the claim? Span-containment on literal fields (**100%**) + LLM-judge on the full claim (**93%**). The one flagged citation is a genuine catch: the extractor labeled "will continue to serve as a Director" as an *appointment*. |
| **Abstention** | `test_abstention.py` + `promptfoo/` | Unanswerable questions must return "insufficient evidence", answerable ones must not. A reliable "I don't know" is a diligence feature. |

## CUAD

CUAD (`theatticusproject/cuad`) is SQuAD-style clause annotation over 510 real
contracts across 41 categories — used **only** as an eval yardstick, never as
demo/corpus data. Only the small seeded subset (`data/cuad_coc_subset.json`) is
committed; regenerate it from the 38MB source with:

```bash
curl -sL https://github.com/TheAtticusProject/cuad/raw/main/data.zip -o /tmp/cuad.zip
unzip -o /tmp/cuad.zip -d eval/data/ CUADv1.json
.venv/bin/python3 eval/build_cuad_subset.py
```

## Known retrieval failure (kept deliberately)

`test_abstention.py` / the Promptfoo grounding cases phrase questions in-context
(the deal room is already about UDC). A query that repeats the filer's own name
— e.g. *"What is **Universal Display** customer concentration?"* — falsely
abstains: the ubiquitous company name dominates both retrieval arms (`ts_rank`
has no corpus IDF, and the name dilutes the query embedding), pushing the
concentration table out of the top-k. This is a real, explainable limitation,
not hidden — the fix at scale is IDF-weighted / learned ranking (Azure AI
Search semantic ranker), the same pattern the prototype already models.
