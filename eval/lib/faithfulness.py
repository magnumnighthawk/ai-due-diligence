import re
from dataclasses import dataclass
from typing import Any

import psycopg

from .llm import get_client, MODEL
from pydantic import BaseModel


@dataclass
class FindingRow:
    id: int
    kind: str
    payload: dict[str, Any]
    doc_id: str
    char_start: int
    char_end: int
    cited_span: str


def load_findings_with_spans(conn: psycopg.Connection) -> list[FindingRow]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT f.id, f.kind, f.payload, f.doc_id, f.char_start, f.char_end,
                   substring(d.raw_text FROM f.char_start + 1 FOR (f.char_end - f.char_start))
            FROM findings f JOIN documents d ON d.id = f.doc_id
            ORDER BY f.id
            """
        )
        return [FindingRow(*row) for row in cur.fetchall()]


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def literal_values(finding: FindingRow) -> list[str]:
    """The verbatim, non-paraphrased fields whose text we expect to appear
    inside the cited span. Percentages and free-text summaries are excluded --
    a percentage may be rendered differently and a summary is a paraphrase, so
    those are left to the LLM judge."""
    p = finding.payload
    fields: list[str] = []
    if finding.kind == "customer_concentration":
        if p.get("customer_name"):
            fields.append(str(p["customer_name"]))
    elif finding.kind == "personnel_event":
        for key in ("person",):
            if p.get(key):
                fields.append(str(p[key]))
    # contract_clause: summary is a paraphrase; nothing reliably verbatim
    return fields


def span_contains_literals(finding: FindingRow) -> bool | None:
    """True/False if the finding has literal fields to check; None if it has
    none (then only the LLM judge applies)."""
    vals = literal_values(finding)
    if not vals:
        return None
    span = _norm(finding.cited_span)
    return all(_norm(v) in span for v in vals)


class FaithfulnessVerdict(BaseModel):
    supported: bool
    reason: str


JUDGE_SYSTEM_PROMPT = """You check citation faithfulness for a due-diligence system. You are given a
structured finding and the exact source span it cites. Answer whether the cited span actually
supports the finding's content -- i.e. a reader looking only at this span would agree the finding is
drawn from it, not invented or attributed to the wrong place.

Be strict: if the span does not contain the specific fact the finding asserts, it is not supported.
"""


def judge_faithfulness(finding: FindingRow) -> FaithfulnessVerdict:
    prompt = (
        f"Finding kind: {finding.kind}\n"
        f"Finding payload: {finding.payload}\n\n"
        f"Cited source span:\n{finding.cited_span}"
    )
    resp = get_client().chat.completions.parse(
        model=MODEL,
        messages=[
            {"role": "system", "content": JUDGE_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        response_format=FaithfulnessVerdict,
        temperature=0,
    )
    return resp.choices[0].message.parsed
