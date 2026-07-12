"""Extraction precision/recall for change-of-control detection, scored against
a held-out CUAD subset (real gold annotations). Run:

    .venv/bin/python3 -m pytest eval/test_extraction.py -s

The -s flag surfaces the printed metrics + per-example disagreements, which are
the point -- walking through where the extractor and CUAD disagree is more
informative than the pass/fail bit.
"""
import json
import pathlib

import pytest
from dotenv import load_dotenv

from lib.llm import classify_change_of_control
from lib.metrics import score

load_dotenv()

SUBSET = pathlib.Path(__file__).parent / "data" / "cuad_coc_subset.json"

# Conservative floors -- gates that the capability works at all, not targets.
# CUAD spans are noisy (annotators highlight surrounding context), so we don't
# demand perfection; we demand the detector is clearly better than chance and
# doesn't over-fire.
MIN_PRECISION = 0.70
MIN_RECALL = 0.70


@pytest.fixture(scope="module")
def subset():
    if not SUBSET.exists():
        pytest.skip(f"{SUBSET} missing -- run eval/build_cuad_subset.py first")
    return json.loads(SUBSET.read_text())["examples"]


def test_change_of_control_extraction_pr(subset):
    preds, golds, disagreements = [], [], []
    for ex in subset:
        verdict = classify_change_of_control(ex["text"])
        preds.append(verdict.is_change_of_control)
        golds.append(ex["is_change_of_control"])
        if verdict.is_change_of_control != ex["is_change_of_control"]:
            disagreements.append((ex, verdict))

    prf = score(preds, golds)
    print("\n=== change_of_control extraction vs CUAD held-out subset ===")
    print(prf.summary())
    print(f"\n{len(disagreements)} disagreement(s) with CUAD gold labels:")
    for ex, verdict in disagreements:
        gold = "CoC" if ex["is_change_of_control"] else "not-CoC"
        pred = "CoC" if verdict.is_change_of_control else "not-CoC"
        print(f"  gold={gold} pred={pred} :: {ex['text'][:110].strip()!r}")
        print(f"     model reason: {verdict.reason[:160]}")

    assert prf.precision >= MIN_PRECISION, f"precision {prf.precision:.2f} < {MIN_PRECISION}"
    assert prf.recall >= MIN_RECALL, f"recall {prf.recall:.2f} < {MIN_RECALL}"
