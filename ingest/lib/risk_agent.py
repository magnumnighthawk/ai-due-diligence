"""LangGraph agent -- the exploratory ceiling. Graph: plan -> gather ->
propose -> self_check -> emit. Unlike the deterministic rules, this agent
is allowed to reason about findings that entity resolution declined to
auto-link (e.g. the anonymized "Customer A/B/C" concentration table), but
every candidate risk must be explicit about which parts of its rationale
are inferred rather than stated outright, and every emitted risk lands in
review_status='needs_review' -- an agent-composed risk is never presented
with the same certainty as a rule-composed one.
"""
import os
from typing import Literal, Optional, TypedDict

import psycopg
from langgraph.graph import END, StateGraph
from openai import OpenAI
from pydantic import BaseModel

AGENT_MODEL = "gpt-4o-mini"

_client = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client


class CandidateRisk(BaseModel):
    title: str
    severity: Literal["Low", "Medium", "High"]
    rationale: str
    cited_finding_ids: list[int]
    uses_inferred_evidence: bool
    inference_note: Optional[str] = None


class ProposeOutput(BaseModel):
    risks: list[CandidateRisk]


class GroundednessVerdict(BaseModel):
    approved: bool
    reason: str
    revised_severity: Optional[Literal["Low", "Medium", "High"]] = None


class AgentState(TypedDict):
    entity_id: int
    entity_name: str
    worth_investigating: bool
    gathered: list[dict]
    candidates: list[CandidateRisk]
    approved: list[tuple[CandidateRisk, str]]  # (risk, groundedness reason)
    rejected: list[tuple[CandidateRisk, str]]  # (risk, rejection reason) -- visible evidence the check works


def _fetch_entity_findings(conn: psycopg.Connection, entity_id: int) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, workstream, kind, payload, doc_id FROM findings WHERE entity_id = %s",
            (entity_id,),
        )
        return [
            {"id": r[0], "workstream": r[1], "kind": r[2], "payload": r[3], "doc_id": r[4], "resolved": True}
            for r in cur.fetchall()
        ]


def _fetch_candidate_context(conn: psycopg.Connection, doc_ids: set[str]) -> list[dict]:
    """Unresolved findings (no entity_id, review_status='needs_review') from
    the same source documents as this entity's resolved findings -- e.g.
    the anonymized concentration-table rows living in the same 10-K as a
    named, resolved concentration finding. Handed to the model as context
    it may reason about, not as pre-established fact."""
    if not doc_ids:
        return []
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, workstream, kind, payload, doc_id FROM findings
            WHERE entity_id IS NULL AND doc_id = ANY(%s) AND review_status = 'needs_review'
            """,
            (list(doc_ids),),
        )
        return [
            {"id": r[0], "workstream": r[1], "kind": r[2], "payload": r[3], "doc_id": r[4], "resolved": False}
            for r in cur.fetchall()
        ]


def plan_node(state: AgentState, conn: psycopg.Connection) -> dict:
    # Gate: only worth a full gather/propose/self_check pass if the entity
    # has findings in more than one workstream -- a single-workstream
    # entity can't produce a cross-workstream risk chain by definition, and
    # this agent exists specifically to find chains the rules engine missed.
    with conn.cursor() as cur:
        cur.execute("SELECT DISTINCT workstream FROM findings WHERE entity_id = %s", (state["entity_id"],))
        workstreams = {r[0] for r in cur.fetchall()}
    return {"worth_investigating": len(workstreams) >= 2}


def _route_after_plan(state: AgentState) -> str:
    return "gather" if state["worth_investigating"] else END


def gather_node(state: AgentState, conn: psycopg.Connection) -> dict:
    resolved = _fetch_entity_findings(conn, state["entity_id"])
    doc_ids = {f["doc_id"] for f in resolved}
    candidate_context = _fetch_candidate_context(conn, doc_ids)
    return {"gathered": resolved + candidate_context}


PROPOSE_SYSTEM_PROMPT = """A deterministic rules engine already establishes that this entity has a
CERTAIN, cross-workstream combination: a customer-concentration finding plus one or more
contract-clause findings, listed below as "resolved" findings (their IDs are fixed and will be
included in the final risk regardless of what you write). It also already emits its own
conservative risk from just those certain facts, capped at Medium severity, because the
concentration finding only states a threshold (e.g. "in excess of 10%") rather than an exact figure.

Your only job: look at the "candidate" findings (unresolved, but from the same source document as a
resolved finding) and decide whether they plausibly sharpen the TRUE magnitude of the concentration
finding enough to justify a higher severity than the rules engine's conservative version. If so,
propose ONE enriched risk; if not, return an empty risks list -- do not just restate the rules
engine's risk, and do not invent an inference that isn't actually supported.

Field semantics: `customer_concentration` findings describe a customer OF THE FILING COMPANY (e.g.
Universal Display Corporation), not a customer of the target entity. customer_name is WHO is being
described as that customer -- it is never "the target entity's own customers."

Concrete example, read carefully: a resolved finding has customer_name="SDC",
pct_revenue_threshold="in excess of 10%" -- this means SDC itself is a customer of the filing
company, contributing >10% of the filing company's revenue. A candidate finding has
customer_name="A", pct_revenue=41.0, from the SAME document/period -- this does NOT mean "Customer A
is a customer of SDC." It means the filing company's own disclosures describe its customers two
ways in the same document: by name in one place, and anonymized by letter in a table elsewhere. If
the number of named customers matches the number of anonymized rows and both come from the same
period, the most likely reading is that "SDC" and "Customer A" (or B, or C) are two different labels
for the SAME customer -- not two different companies. The document does not state which letter the
target entity corresponds to. You may still use the set of anonymized figures to characterize the
plausible range/magnitude of the target entity's true concentration (e.g. "somewhere in the
13-41% range this document discloses for its top customers, given only a >10% floor is stated by
name") -- but you must say explicitly that the specific letter-to-name mapping is not stated in the
document and is not something you're asserting.

Rules:
1. Never state a candidate finding's content as if it were a certain fact about the target entity.
   Set uses_inferred_evidence=true and explain the inference in inference_note -- name the specific
   ambiguity (e.g. "the filing anonymizes this customer and does not state which named customer it
   corresponds to").
2. cited_finding_ids should include the resolved finding IDs you were given plus any candidate IDs
   you actually rely on (the resolved ones will be enforced regardless, but include them anyway).
3. Severity should reflect your actual confidence: don't claim High unless the inference genuinely
   supports it, and say so plainly in the rationale.
"""


def propose_node(state: AgentState) -> dict:
    resolved = [f for f in state["gathered"] if f["resolved"]]
    candidates = [f for f in state["gathered"] if not f["resolved"]]
    concentration = [f for f in resolved if f["kind"] == "customer_concentration"]
    clauses = [f for f in resolved if f["kind"] == "contract_clause"]

    # The cross-workstream combination itself is established deterministically,
    # not left to the model to notice or forget -- its only job is judging
    # whether candidate evidence justifies a higher severity than that.
    if not (concentration and clauses) or not candidates:
        return {"candidates": []}

    base_ids = [f["id"] for f in concentration + clauses]
    prompt = (
        f"Target entity: {state['entity_name']}\n\n"
        f"Resolved findings (IDs {base_ids}, will always be cited):\n{_format_findings(resolved)}\n\n"
        f"Candidate (unresolved, same-document) findings:\n{_format_findings(candidates)}"
    )
    resp = _get_client().chat.completions.parse(
        model=AGENT_MODEL,
        messages=[{"role": "system", "content": PROPOSE_SYSTEM_PROMPT}, {"role": "user", "content": prompt}],
        response_format=ProposeOutput,
        temperature=0,
    )
    risks = resp.choices[0].message.parsed.risks
    for risk in risks:
        risk.cited_finding_ids = sorted(set(risk.cited_finding_ids) | set(base_ids))
    return {"candidates": risks}


SELF_CHECK_SYSTEM_PROMPT = """You are a groundedness checker for a due-diligence risk-composition
agent. Given a proposed risk and the full text of every finding it cites, verify:
1. Every claim in the rationale is actually supported by the cited findings' content.
2. If the risk uses inferred evidence, the inference is reasonable and doesn't contradict what's
   actually stated.
3. The severity is consistent with how confident the evidence actually is.

Two different problems call for two different responses -- do not conflate them:
- FABRICATION (reject, approved=false): the rationale states something no cited finding supports at
  all, cites a finding that doesn't actually relate, or the inference itself is not reasonable given
  the findings.
- OVERCONFIDENCE (approve=true, but set revised_severity): the underlying inference and citations
  are fine, but the severity claimed doesn't match how uncertain that inference actually is (e.g. an
  unconfirmed 1-of-3 possibility alone shouldn't usually carry the same severity as a confirmed
  fact). This is normal and expected for an exploratory, inference-based risk -- downgrade it, don't
  discard it; the point of this system is to surface the possibility for a human to verify, clearly
  labeled with the right confidence level, not to only ever emit things that are already certain.
"""


def self_check_node(state: AgentState, conn: psycopg.Connection) -> dict:
    findings_by_id = {f["id"]: f for f in state["gathered"]}
    approved, rejected = [], []
    for risk in state["candidates"]:
        cited = [findings_by_id[fid] for fid in risk.cited_finding_ids if fid in findings_by_id]
        if len(cited) != len(risk.cited_finding_ids):
            rejected.append((risk, "cited a finding ID that was never provided to the model"))
            continue

        prompt = (
            f"Proposed risk:\n{risk.model_dump_json(indent=2)}\n\n"
            f"Cited findings (full content):\n{_format_findings(cited)}"
        )
        resp = _get_client().chat.completions.parse(
            model=AGENT_MODEL,
            messages=[{"role": "system", "content": SELF_CHECK_SYSTEM_PROMPT}, {"role": "user", "content": prompt}],
            response_format=GroundednessVerdict,
            temperature=0,
        )
        verdict = resp.choices[0].message.parsed
        if verdict.approved:
            if verdict.revised_severity:
                risk.severity = verdict.revised_severity
            approved.append((risk, verdict.reason))
        else:
            rejected.append((risk, verdict.reason))
    return {"approved": approved, "rejected": rejected}


def _format_findings(findings: list[dict]) -> str:
    return "\n".join(
        f"[id={f['id']}] workstream={f['workstream']} kind={f['kind']} resolved={f['resolved']} payload={f['payload']}"
        for f in findings
    )


def _insert_risk(conn: psycopg.Connection, risk: CandidateRisk, groundedness_reason: str) -> int:
    rationale = risk.rationale
    if risk.uses_inferred_evidence:
        rationale += f" [Agent inference, needs human verification: {risk.inference_note}]"
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO risks (title, severity, rationale, source, finding_ids, review_status)
            VALUES (%s, %s, %s, 'agent', %s, 'needs_review')
            RETURNING id
            """,
            (risk.title, risk.severity, rationale, risk.cited_finding_ids),
        )
        return cur.fetchone()[0]


def build_graph(conn: psycopg.Connection):
    graph = StateGraph(AgentState)
    graph.add_node("plan", lambda state: plan_node(state, conn))
    graph.add_node("gather", lambda state: gather_node(state, conn))
    graph.add_node("propose", propose_node)
    graph.add_node("self_check", lambda state: self_check_node(state, conn))

    graph.set_entry_point("plan")
    graph.add_conditional_edges("plan", _route_after_plan, {"gather": "gather", END: END})
    graph.add_edge("gather", "propose")
    graph.add_edge("propose", "self_check")
    graph.add_edge("self_check", END)
    return graph.compile()


def run_agent(conn: psycopg.Connection) -> tuple[list[int], list[tuple[str, CandidateRisk, str]]]:
    """Returns (inserted risk IDs, rejected-candidate trace) -- the trace is
    evidence the groundedness check does real work, not a rubber stamp, and
    is worth surfacing even when (especially when) nothing gets approved."""
    with conn.cursor() as cur:
        cur.execute("SELECT id, canonical_name FROM entities")
        entities = cur.fetchall()

    app = build_graph(conn)
    risk_ids = []
    rejected_trace = []
    for entity_id, entity_name in entities:
        result = app.invoke(
            {
                "entity_id": entity_id,
                "entity_name": entity_name,
                "worth_investigating": False,
                "gathered": [],
                "candidates": [],
                "approved": [],
                "rejected": [],
            }
        )
        for risk, reason in result.get("approved", []):
            risk_ids.append(_insert_risk(conn, risk, reason))
        for risk, reason in result.get("rejected", []):
            rejected_trace.append((entity_name, risk, reason))

    conn.commit()
    return risk_ids, rejected_trace
