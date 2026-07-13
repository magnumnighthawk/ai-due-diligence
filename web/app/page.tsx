"use client";

import { useCallback, useState } from "react";
import { LayoutGrid, MessagesSquare, Radar, X } from "lucide-react";
import RegisterView from "./components/RegisterView";
import AskView from "./components/AskView";

type View = "register" | "ask";

export default function Home() {
  const [view, setView] = useState<View>("register");
  const [error, setError] = useState<string | null>(null);
  const onError = useCallback((msg: string) => setError(msg), []);

  return (
    <main className="flex h-screen flex-col bg-slate-50 text-slate-900">
      <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-5 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Radar className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold text-slate-900">Diligence Radar</h1>
            <p className="text-[11px] text-slate-400">
              Cross-workstream risk over a surrogate SEC-filing deal room
            </p>
          </div>
        </div>

        <nav className="ml-auto flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
          <TabButton active={view === "register"} onClick={() => setView("register")} icon={<LayoutGrid className="h-3.5 w-3.5" />}>
            Risk Register
          </TabButton>
          <TabButton active={view === "ask"} onClick={() => setView("ask")} icon={<MessagesSquare className="h-3.5 w-3.5" />}>
            Ask the Deal Room
          </TabButton>
        </nav>
      </header>

      {error && (
        <div className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-5 py-1.5 text-xs text-rose-700">
          <span className="flex-1">
            {error} — is the API running on {process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"}?
          </span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {view === "register" ? <RegisterView onError={onError} /> : <AskView onError={onError} />}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
