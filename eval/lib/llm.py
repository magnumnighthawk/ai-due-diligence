import os

from openai import OpenAI
from pydantic import BaseModel

MODEL = "gpt-4o-mini"

_client = None


def get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client


class CoCVerdict(BaseModel):
    is_change_of_control: bool
    reason: str


COC_SYSTEM_PROMPT = """You classify a single contract clause. Answer whether the clause is a
"Change of Control" provision as defined by legal due-diligence review: a clause that governs what
happens to the agreement or a party's rights/obligations when there is a change of control of a
party -- e.g. assignment or transfer permitted/restricted on merger, acquisition, or sale of
substantially all assets; termination rights triggered by a change of control; or a duty to notify
on a change of control.

Return is_change_of_control=true only if the clause actually concerns a change of control / change
in ownership of a party. A generic assignment clause with no change-of-control trigger, a governing
law clause, an audit clause, an insurance clause, etc. are NOT change of control.
"""


def classify_change_of_control(clause_text: str) -> CoCVerdict:
    """Mirrors the change-of-control detection the extraction pipeline relies
    on (same model, structured output), isolated to a single clause so it can
    be scored against CUAD's gold Change-of-Control annotations."""
    resp = get_client().chat.completions.parse(
        model=MODEL,
        messages=[
            {"role": "system", "content": COC_SYSTEM_PROMPT},
            {"role": "user", "content": f"Clause:\n{clause_text}"},
        ],
        response_format=CoCVerdict,
        temperature=0,
    )
    return resp.choices[0].message.parsed
