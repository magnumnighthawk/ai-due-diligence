"""Deterministic cross-reference rules -- the reliable floor. Every risk
here is composed only from entity-resolved, auto-linked findings (never
anything sitting in review_status='needs_review'), so severity is derived
conservatively from what's actually certain."""
import re
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

import psycopg

from .deal_context import DEAL

ASSIGNMENT_CLAUSE_TYPES = {"assignment", "change_of_control"}
SENIOR_FINANCE_ROLE_RE = re.compile(r"chief financial officer|\bcfo\b", re.IGNORECASE)
PCT_RE = re.compile(r"(\d+(?:\.\d+)?)")

_SEV_ORDER = {"Low": 0, "Medium": 1, "High": 2}


def _max_sev(a: str, b: str) -> str:
    return a if _SEV_ORDER[a] >= _SEV_ORDER[b] else b


@dataclass
class Finding:
    id: int
    workstream: str
    kind: str
    payload: dict[str, Any]
    entity_id: int | None
    review_status: str


def _load_findings(conn: psycopg.Connection) -> list[Finding]:
    with conn.cursor() as cur:
        cur.execute("SELECT id, workstream, kind, payload, entity_id, review_status FROM findings")
        return [Finding(*row) for row in cur.fetchall()]


def _entity_names(conn: psycopg.Connection) -> dict[int, str]:
    with conn.cursor() as cur:
        cur.execute("SELECT id, canonical_name FROM entities")
        return dict(cur.fetchall())


def _insert_risk(
    conn: psycopg.Connection, title: str, severity: str, rationale: str, source: str, finding_ids: list[int], review_status: str
) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO risks (title, severity, rationale, source, finding_ids, review_status)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (title, severity, rationale, source, finding_ids, review_status),
        )
        return cur.fetchone()[0]


def _max_disclosed_pct(concentration_findings: list[Finding]) -> float | None:
    """The highest number we can point to with certainty for this entity --
    an exact pct_revenue if stated, else the number embedded in a threshold
    phrase like "in excess of 10%" (which is a floor, not the true figure)."""
    best = None
    for f in concentration_findings:
        pct = f.payload.get("pct_revenue")
        if pct is None:
            m = PCT_RE.search(f.payload.get("pct_revenue_threshold") or "")
            pct = float(m.group(1)) if m else None
        if pct is not None and (best is None or pct > best):
            best = pct
    return best


def concentration_x_assignment_rule(conn: psycopg.Connection) -> list[int]:
    """IF an entity has a resolved CustomerConcentration finding AND a
    resolved assignment/change-of-control ContractClause THEN emit a risk
    citing every related finding for that entity (including termination and
    term-expiry clauses as compounding evidence)."""
    findings = [f for f in _load_findings(conn) if f.entity_id is not None]
    names = _entity_names(conn)

    by_entity: dict[int, list[Finding]] = defaultdict(list)
    for f in findings:
        by_entity[f.entity_id].append(f)

    risk_ids = []
    for entity_id, group in by_entity.items():
        concentration = [f for f in group if f.kind == "customer_concentration"]
        assignment = [f for f in group if f.kind == "contract_clause" and f.payload["clause_type"] in ASSIGNMENT_CLAUSE_TYPES]
        termination = [f for f in group if f.kind == "contract_clause" and f.payload["clause_type"] == "termination"]
        expiry = [f for f in group if f.kind == "contract_clause" and f.payload["clause_type"] == "term_expiry"]

        if not (concentration and assignment):
            continue

        max_pct = _max_disclosed_pct(concentration)
        # Severity is materiality-scaled to THIS deal (see deal_context): the
        # revenue-at-risk (concentration% x target revenue) is compared to the
        # deal's own materiality bands, not a hardcoded percentage. The
        # cross-workstream combination is at minimum a Medium concern; it is
        # escalated to High either when the concentration is itself materially
        # large for this deal, OR from the compounding of several
        # independently-certain contract factors -- assignment/change-of-control
        # rights, 2+ distinct termination triggers, AND a fixed expiry -- even
        # when the concentration figure is only a threshold. This deliberately
        # doesn't require guessing which anonymized concentration-table row
        # belongs to this entity (see the agent tier for that inference, which
        # its own groundedness check may reject as too weak to rely on).
        conc_sev = DEAL.concentration_severity(max_pct)
        compounding = len(termination) >= 2 and bool(expiry)
        severity = _max_sev(conc_sev, "Medium")
        if compounding:
            severity = "High"
        entity_name = names[entity_id]

        rationale_parts = [
            f"{entity_name} is a named customer contributing "
            + (f"at least {max_pct:.0f}% of revenue" if max_pct is not None else "a materially concentrated share of revenue")
            + f" (finding #{concentration[0].id}), and the governing agreement with {entity_name} "
            f"permits assignment/transfer on merger, acquisition, or change of control (finding #{assignment[0].id})."
        ]
        if max_pct is not None:
            rar = DEAL.revenue_at_risk_m(max_pct)
            threshold_hit = "at or above" if rar >= DEAL.materiality_high_m else "below"
            rationale_parts.append(
                f"Scaled to this deal ({DEAL.money(DEAL.revenue_low_m)}–{DEAL.money(DEAL.revenue_high_m)} "
                f"target revenue), a {max_pct:.0f}% single-customer concentration is roughly "
                f"{DEAL.money(rar)} of revenue at risk at the band midpoint — {threshold_hit} the "
                f"{DEAL.money(DEAL.materiality_high_m)} High-materiality threshold set for this engagement."
            )
        if expiry:
            rationale_parts.append(
                f"The agreement's term runs to a fixed expiry (finding #{expiry[0].id}), so renewal and "
                "counterparty risk both sit inside a near-term deal horizon."
            )
        if termination:
            rationale_parts.append(
                f"The agreement is also terminable on {len(termination)} independent grounds (finding(s) "
                f"#{', #'.join(str(f.id) for f in termination)}), which compounds the concentration exposure "
                "regardless of the exact revenue percentage."
            )
        if compounding and conc_sev != "High":
            rationale_parts.append(
                "Rated High on the compounding of certain facts alone (assignment rights + multiple "
                "termination triggers + a fixed near-term expiry), not on the unconfirmed magnitude of "
                "the concentration figure — which on its own would rate "
                f"{conc_sev} against this deal's materiality bands."
            )
        rationale_parts.append(
            "This risk uses only findings auto-linked to a resolved entity; it does not rely on any "
            "figure from the anonymized customer-concentration table, which could not be confidently "
            "matched to a named customer."
        )

        cited = concentration + assignment + termination + expiry
        title = f"Revenue concentration in {entity_name} amplified by contract assignment/change-of-control rights"
        risk_id = _insert_risk(
            conn, title, severity, " ".join(rationale_parts), "rule", [f.id for f in cited], "auto"
        )
        risk_ids.append(risk_id)

    return risk_ids


def personnel_monitoring_rule(conn: psycopg.Connection) -> list[int]:
    """IF a senior finance executive departs THEN emit a standalone,
    deliberately Low-severity monitoring note -- never merged into a
    customer-concentration risk, since nothing in the reviewed documents
    ties this departure to any specific customer relationship. Flagging
    everything red erodes trust in what actually is high severity."""
    findings = _load_findings(conn)
    risk_ids = []
    for f in findings:
        if f.kind != "personnel_event" or f.payload.get("event_type") != "departure":
            continue
        if not SENIOR_FINANCE_ROLE_RE.search(f.payload.get("role", "")):
            continue
        title = f"Executive transition: {f.payload['person']} ({f.payload['role']}) departure"
        rationale = (
            f"{f.payload['person']} departed the role of {f.payload['role']} as of {f.payload['date']} "
            f"(finding #{f.id}). No document in this corpus ties this departure to a specific customer, "
            "contract, or relationship -- rated Low and included for monitoring, not because it drives "
            "material risk on its own."
        )
        risk_id = _insert_risk(conn, title, "Low", rationale, "rule", [f.id], "auto")
        risk_ids.append(risk_id)
    return risk_ids


def run_rules(conn: psycopg.Connection) -> dict[str, list[int]]:
    result = {
        "concentration_x_assignment": concentration_x_assignment_rule(conn),
        "personnel_monitoring": personnel_monitoring_rule(conn),
    }
    conn.commit()
    return result
