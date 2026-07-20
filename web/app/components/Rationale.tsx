"use client";

import { Fragment, type ReactNode } from "react";
import type { FindingDetail } from "../lib/api";
import RichText, { splitBold } from "./RichText";

type Props = {
  rationale: string;
  findings: FindingDetail[];
  onSelectFinding: (finding: FindingDetail) => void;
  activeFindingId: number | null;
};

// The server writes rationales referencing findings by raw DB id ("finding #3").
// The findings list beneath is ordered independently, so "#3" is meaningless to
// an operator. Here we reconcile: map each DB id to its 1-based position in the
// list and rewrite every "#<db_id>" into a clickable chip labelled "#<position>"
// that selects/opens that finding. Only hash-prefixed numbers are touched, so
// percentages, years and durations ("41%", "2027", "30-day") are left alone.
export default function Rationale({
  rationale,
  findings,
  onSelectFinding,
  activeFindingId,
}: Props) {
  const positionById = new Map<number, number>();
  findings.forEach((f, i) => positionById.set(f.id, i + 1));

  // Rule-composed rationales are single-paragraph prose, so this renders
  // identically to before; agent-composed ones can carry real structure
  // (newlines, numbered points) that would otherwise collapse inline.
  const renderInline = (segment: string, keyBase: string): ReactNode =>
    splitBold(segment).map((part, pi) => {
      const inner = renderRefs(part.text, positionById, findings, onSelectFinding, activeFindingId, `${keyBase}-${pi}`);
      return part.bold ? (
        <strong key={`${keyBase}-${pi}`} className="font-semibold text-graphite-800">
          {inner}
        </strong>
      ) : (
        <Fragment key={`${keyBase}-${pi}`}>{inner}</Fragment>
      );
    });

  return (
    <RichText
      text={rationale}
      renderInline={renderInline}
      className="text-body leading-relaxed text-graphite-700"
    />
  );
}

function renderRefs(
  rationale: string,
  positionById: Map<number, number>,
  findings: FindingDetail[],
  onSelectFinding: (finding: FindingDetail) => void,
  activeFindingId: number | null,
  keyBase: string,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /#(\d+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(rationale)) !== null) {
    const dbId = Number(match[1]);
    const position = positionById.get(dbId);

    // Text before this reference.
    if (match.index > lastIndex) {
      nodes.push(<Fragment key={`${keyBase}-t${key++}`}>{rationale.slice(lastIndex, match.index)}</Fragment>);
    }

    if (position !== undefined) {
      const finding = findings[position - 1];
      const active = activeFindingId === dbId;
      nodes.push(
        <button
          key={`${keyBase}-c${key++}`}
          type="button"
          onClick={() => onSelectFinding(finding)}
          title={`Finding ${position}: ${finding.kind}`}
          className={`mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 align-baseline font-mono text-micro font-semibold tabular-nums transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-500 focus-visible:ring-offset-1 active:scale-95 ${
            active
              ? "bg-signal-600 text-graphite-0"
              : "bg-signal-100 text-signal-700 hover:bg-signal-200"
          }`}
        >
          #{position}
        </button>,
      );
    } else {
      // Unknown id -- leave the original token untouched.
      nodes.push(<Fragment key={`${keyBase}-r${key++}`}>{match[0]}</Fragment>);
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < rationale.length) {
    nodes.push(<Fragment key={`${keyBase}-t${key++}`}>{rationale.slice(lastIndex)}</Fragment>);
  }

  return nodes;
}
