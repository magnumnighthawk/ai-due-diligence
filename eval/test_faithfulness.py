"""Citation faithfulness: for every finding, does its cited source span
actually contain the claim? Two independent checks:

  1. span-containment -- literal fields (customer/person names) must appear
     verbatim in the cited span. Cheap, deterministic, high-precision.
  2. LLM judge -- the whole finding (incl. paraphrased clause summaries) must
     be supported by the span.

Run:  .venv/bin/python3 -m pytest eval/test_faithfulness.py -s
"""
import pytest
from dotenv import load_dotenv

from lib.db import get_conn
from lib.faithfulness import (
    judge_faithfulness,
    load_findings_with_spans,
    span_contains_literals,
)

load_dotenv()

MIN_JUDGE_FAITHFUL = 0.90
MIN_LITERAL_FAITHFUL = 1.00  # literal names must always appear in the span they were drawn from


@pytest.fixture(scope="module")
def findings():
    conn = get_conn()
    try:
        rows = load_findings_with_spans(conn)
    finally:
        conn.close()
    if not rows:
        pytest.skip("no findings in DB -- run the ingest/extract/resolve pipeline first")
    return rows


def test_citation_faithfulness(findings):
    literal_checked = literal_ok = 0
    judged = faithful = 0
    failures = []

    for f in findings:
        lit = span_contains_literals(f)
        if lit is not None:
            literal_checked += 1
            literal_ok += int(lit)
            if not lit:
                failures.append((f, "literal field not found in cited span"))

        verdict = judge_faithfulness(f)
        judged += 1
        faithful += int(verdict.supported)
        if not verdict.supported:
            failures.append((f, f"judge: {verdict.reason[:140]}"))

    literal_rate = literal_ok / literal_checked if literal_checked else 1.0
    judge_rate = faithful / judged if judged else 0.0

    print("\n=== citation faithfulness ===")
    print(f"span-containment (literal fields): {literal_ok}/{literal_checked} = {literal_rate:.0%}")
    print(f"LLM-judge supported:               {faithful}/{judged} = {judge_rate:.0%}")
    if failures:
        print("\nunfaithful citations:")
        for f, why in failures:
            print(f"  finding #{f.id} ({f.kind}): {why}")

    assert literal_rate >= MIN_LITERAL_FAITHFUL, f"literal containment {literal_rate:.0%}"
    assert judge_rate >= MIN_JUDGE_FAITHFUL, f"judge faithfulness {judge_rate:.0%}"
