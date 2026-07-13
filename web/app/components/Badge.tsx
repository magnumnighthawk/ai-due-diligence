import type { ReactNode } from "react";

export function Badge({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${className}`}
    >
      {children}
    </span>
  );
}

const SEVERITY_STYLES: Record<string, string> = {
  High: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
  Medium: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  Low: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200",
};

const SEVERITY_DOT: Record<string, string> = {
  High: "bg-rose-500",
  Medium: "bg-amber-500",
  Low: "bg-slate-400",
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
  const style =
    source === "agent"
      ? "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200"
      : "bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200";
  return <Badge className={style}>{source}</Badge>;
}

export function ReviewBadge() {
  return (
    <Badge className="bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">
      needs review
    </Badge>
  );
}
