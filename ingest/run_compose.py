"""Block 3: cross-reference + risk composition. Runs the deterministic
rules (reliable floor) first, then the LangGraph agent (exploratory
ceiling) over the same findings/entities.

    .venv/bin/python3 ingest/run_compose.py
"""
import pathlib
import sys

from dotenv import load_dotenv

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from lib.db import get_conn
from lib.risk_agent import run_agent
from lib.risk_rules import run_rules
from lib.timing import stage_timer

load_dotenv()


def main():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM risks")
        conn.commit()

        with stage_timer(conn, "compose") as t:
            rule_results = run_rules(conn)
            for name, ids in rule_results.items():
                print(f"rule[{name}]: {len(ids)} risk(s)")

            agent_ids, rejected = run_agent(conn)
            print(f"agent: {len(agent_ids)} risk(s) approved, {len(rejected)} rejected by self-check")
            for entity_name, risk, reason in rejected:
                print(f"  [rejected | {entity_name}] {risk.title} (proposed {risk.severity})")
                print(f"    self-check: {reason}")

            rule_total = sum(len(ids) for ids in rule_results.values())
            t.item_count = rule_total + len(agent_ids)
            t.detail = {"rules": rule_total, "agent_approved": len(agent_ids), "agent_rejected": len(rejected)}
    finally:
        conn.close()


if __name__ == "__main__":
    main()
