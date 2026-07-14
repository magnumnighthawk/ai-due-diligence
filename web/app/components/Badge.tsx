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
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-micro font-semibold uppercase tracking-wide ${className}`}
    >
      {children}
    </span>
  );
}

// Severity/confidence stay conventional rose/amber/emerald -- users expect
// red = high risk; changing that would hurt usability, not distinctiveness.
const SEVERITY_STYLES: Record<string, string> = {
  High: "bg-rose-100 text-rose-700",
  Medium: "bg-amber-100 text-amber-800",
  Low: "bg-graphite-100 text-graphite-600",
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
  const style = source === "agent" ? "bg-violet-100 text-violet-700" : "bg-graphite-100 text-graphite-600";
  return <Badge className={style}>{source}</Badge>;
}

export function ReviewBadge() {
  return <Badge className="bg-amber-100 text-amber-800">needs review</Badge>;
}
