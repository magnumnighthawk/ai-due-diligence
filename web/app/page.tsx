"use client";

import { useCallback, useState } from "react";
import { LayoutGrid, MessagesSquare, Radar, X } from "lucide-react";
import RegisterView from "./components/RegisterView";
import AskView from "./components/AskView";
import { ICON_DEFAULT } from "./components/icons";

type View = "register" | "ask";

export default function Home() {
  const [view, setView] = useState<View>("register");
  const [error, setError] = useState<string | null>(null);
  const onError = useCallback((msg: string) => setError(msg), []);

  return (
    <main className="flex h-screen flex-col bg-graphite-50">
      <header className="flex items-center gap-4 border-b border-graphite-200 bg-graphite-0 px-5 py-2.5">
        <div className="flex items-center gap-2.5">
          {/* Brand mark -- a one-off icon, not part of the shared 3-tier icon
              scale meant for icons repeated across contexts. */}
          <span className="flex h-8 w-8 items-center justify-center rounded-chip bg-signal-600 text-graphite-0">
            <Radar className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold text-graphite-950">Diligence Radar</h1>
            <p className="hidden text-micro text-graphite-600 sm:block">
              Cross-workstream risk over a surrogate SEC-filing deal room
            </p>
          </div>
        </div>

        <nav className="ml-auto flex items-center gap-1 rounded-card bg-graphite-100 p-0.5">
          <TabButton active={view === "register"} onClick={() => setView("register")} icon={<LayoutGrid className={ICON_DEFAULT} />} label="Risk Register">
            Risk Register
          </TabButton>
          <TabButton active={view === "ask"} onClick={() => setView("ask")} icon={<MessagesSquare className={ICON_DEFAULT} />} label="Ask the Deal Room">
            Ask the Deal Room
          </TabButton>
        </nav>
      </header>

      {error && (
        <div className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-5 py-1.5 text-xs text-rose-700">
          <span className="flex-1">
            {error} — is the API running on {process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"}?
          </span>
          <button
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            className="rounded-chip p-0.5 text-rose-400 transition-colors hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-1 active:scale-95"
          >
            <X className={ICON_DEFAULT} />
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
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex items-center gap-1.5 rounded-chip px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-graphite-0 active:scale-[0.98] ${
        active ? "bg-graphite-0 text-signal-700 shadow-raised" : "text-graphite-600 hover:text-graphite-800"
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{children}</span>
    </button>
  );
}
