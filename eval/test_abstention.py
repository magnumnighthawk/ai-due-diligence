"""Abstention test (offline pytest companion to the Promptfoo Q&A config).

Feeds questions the corpus cannot answer and checks the pipeline explicitly
abstains ("insufficient evidence") rather than fabricating -- and, as a
control, that genuinely answerable questions are NOT abstained on. In
diligence a reliable "I don't know" is a feature.

Runs the real retrieval + answer pipeline directly (no HTTP server needed):
    .venv/bin/python3 -m pytest eval/test_abstention.py -s
"""
import pathlib
import sys

import pytest
from dotenv import load_dotenv

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "api"))

from app.answer import answer_question  # noqa: E402
from app.db import get_conn  # noqa: E402
from app.retrieval import hybrid_search  # noqa: E402

load_dotenv()

ABSTAIN_MARKER = "insufficient evidence"

UNANSWERABLE = [
    "What was Universal Display's stock price on 15 March 2024?",
    "How many employees does BOE Technology have in Vietnam?",
    "What are the payment terms in the agreement with Apple?",
]

ANSWERABLE = [
    "What is the customer concentration disclosed in the filings?",
    "Can the Samsung license agreement be assigned on a change of control?",
]


def _answer(question: str) -> str:
    conn = get_conn()
    try:
        chunks = hybrid_search(conn, question, top_k=8)
    finally:
        conn.close()
    return answer_question(question, chunks)


@pytest.mark.parametrize("question", UNANSWERABLE)
def test_abstains_on_unanswerable(question):
    answer = _answer(question)
    print(f"\nQ: {question}\nA: {answer[:160]}")
    assert ABSTAIN_MARKER in answer.lower(), f"expected abstention, got: {answer[:200]}"


@pytest.mark.parametrize("question", ANSWERABLE)
def test_answers_answerable(question):
    answer = _answer(question)
    print(f"\nQ: {question}\nA: {answer[:160]}")
    assert ABSTAIN_MARKER not in answer.lower(), f"unexpected abstention: {answer[:200]}"
