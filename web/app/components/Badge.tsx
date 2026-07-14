import type { ReactNode } from "react";

export function Badge({
  children,
  className = "",
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-chip px-1.5 py-0.5 text-micro font-semibold uppercase tracking-wide ${className}`}
    >
      {children}
    </span>
  );
}

// Severity/confidence stay conventional rose/amber/emerald -- users expect
// red = high risk; changing that would hurt usability, not distinctiveness.
const SEVERITY_STYLES: Record<string, string> = {
  High: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
  Medium: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  Low: "bg-graphite-100 text-graphite-600 ring-1 ring-inset ring-graphite-200",
};

const SEVERITY_DOT: Record<string, string> = {
  High: "bg-rose-500",
  Medium: "bg-amber-500",
  Low: "bg-graphite-400",
};

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <Badge className={SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.Low}>
      <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[severity] ?? SEVERITY_DOT.Low}`} />
      {severity}
    </Badge>
  );
}

export function SourceBadge({ source }: { source: string }) {
  // "agent" stays violet -- a legitimate third semantic category (provenance),
  // distinct from the graphite/signal neutral+brand palette.
  const style =
    source === "agent"
      ? "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200"
      : "bg-graphite-100 text-graphite-600 ring-1 ring-inset ring-graphite-200";
  return <Badge className={style}>{source}</Badge>;
}

export function ReviewBadge() {
  return (
    <Badge className="bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">
      needs review
    </Badge>
  );
}
