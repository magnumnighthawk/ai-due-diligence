"""Build a small, seeded, held-out CUAD subset for the change-of-control
extraction eval, and commit only the subset (not the 38MB source).

CUAD (theatticusproject/cuad) is SQuAD-style clause annotation over 510 real
contracts across 41 categories. We use it ONLY as an eval yardstick, never as
demo/corpus data. "Change Of Control" is one of the 41 categories, which is
exactly the clause the cross-workstream money-shot depends on detecting.

    # one-time: download the 38MB source (gitignored)
    curl -sL https://github.com/TheAtticusProject/cuad/raw/main/data.zip -o /tmp/cuad.zip
    unzip -o /tmp/cuad.zip -d eval/data/ CUADv1.json
    .venv/bin/python3 eval/build_cuad_subset.py

Positives = the real annotated "Change Of Control" answer spans. Negatives =
annotated spans from clearly-unrelated categories (Governing Law, Cap On
Liability, ...). "Anti-Assignment" is deliberately excluded from negatives:
those clauses frequently reference change of control themselves, so using them
as negatives would inject label noise rather than test a real distinction.
"""
import json
import pathlib
import random

DATA_DIR = pathlib.Path(__file__).parent / "data"
SOURCE = DATA_DIR / "CUADv1.json"
OUT = DATA_DIR / "cuad_coc_subset.json"

SEED = 20260712
N_PER_CLASS = 25
MIN_SPAN_CHARS = 40  # skip trivially short spans that carry no clause signal

NEGATIVE_CATEGORIES = [
    "Governing Law",
    "Cap On Liability",
    "Insurance",
    "Audit Rights",
    "Non-Compete",
    "Notice Period To Terminate Renewal",
    "Warranty Duration",
    "Non-Disparagement",
    "Revenue/Profit Sharing",
    "Minimum Commitment",
]


def _category(qa_id: str) -> str:
    return qa_id.split("__")[-1]


def main():
    if not SOURCE.exists():
        raise SystemExit(
            f"{SOURCE} not found -- download it first (see this file's docstring)."
        )

    data = json.load(open(SOURCE))["data"]
    positives: list[str] = []
    negatives_by_cat: dict[str, list[str]] = {c: [] for c in NEGATIVE_CATEGORIES}

    for contract in data:
        for qa in contract["paragraphs"][0]["qas"]:
            cat = _category(qa["id"])
            for ans in qa["answers"]:
                text = ans["text"].strip()
                if len(text) < MIN_SPAN_CHARS:
                    continue
                if cat == "Change Of Control":
                    positives.append(text)
                elif cat in negatives_by_cat:
                    negatives_by_cat[cat].append(text)

    rng = random.Random(SEED)
    rng.shuffle(positives)
    pos_sample = positives[:N_PER_CLASS]

    # Round-robin across negative categories so no single clause type dominates.
    neg_pool: list[str] = []
    for cat in NEGATIVE_CATEGORIES:
        rng.shuffle(negatives_by_cat[cat])
    idx = 0
    while len(neg_pool) < N_PER_CLASS:
        cat = NEGATIVE_CATEGORIES[idx % len(NEGATIVE_CATEGORIES)]
        bucket = negatives_by_cat[cat]
        take = idx // len(NEGATIVE_CATEGORIES)
        if take < len(bucket):
            neg_pool.append(bucket[take])
        idx += 1
        if idx > 10000:
            break

    examples = (
        [{"text": t, "is_change_of_control": True} for t in pos_sample]
        + [{"text": t, "is_change_of_control": False} for t in neg_pool]
    )
    rng.shuffle(examples)

    OUT.write_text(json.dumps({"seed": SEED, "examples": examples}, indent=2))
    print(f"wrote {OUT} -- {len(pos_sample)} positive, {len(neg_pool)} negative")


if __name__ == "__main__":
    main()
