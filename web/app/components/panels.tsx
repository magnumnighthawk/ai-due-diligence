import type { ReactNode } from "react";

export function PanelHeader({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-graphite-200 bg-graphite-0/90 px-5 py-3.5 text-micro font-semibold uppercase tracking-wide text-graphite-600 backdrop-blur">
      {icon && <span className="text-graphite-400">{icon}</span>}
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10 text-center text-body text-graphite-600">
      {children}
    </div>
  );
}
