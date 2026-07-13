import type { ReactNode } from "react";

export function PanelHeader({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-slate-200 bg-white/90 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 backdrop-blur">
      {icon && <span className="text-slate-400">{icon}</span>}
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10 text-center text-xs text-slate-400">
      {children}
    </div>
  );
}
