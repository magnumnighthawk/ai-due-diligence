"use client";

import { useCallback, useState } from "react";
import { LayoutGrid, MessagesSquare, Radar, X } from "lucide-react";
import RegisterView from "./components/RegisterView";
import AskView from "./components/AskView";
import { Badge } from "./components/Badge";
import { ICON_DEFAULT } from "./components/icons";

// This surrogate deal room is fixed to a single target company for the
// duration of the engagement; surfaced in the header so it's always clear
// which deal room is in view.
const DEAL_CLIENT = "Universal Display Corporation";

type View = "register" | "ask";

export default function Home() {
  const [view, setView] = useState<View>("register");
  const [error, setError] = useState<string | null>(null);
  const onError = useCallback((msg: string) => setError(msg), []);

  return (
    <main className="flex h-screen flex-col bg-graphite-50">
      <header className="flex items-center gap-4 border-b border-graphite-200 bg-graphite-0 px-6 py-4">
        <div className="flex items-center gap-3">
          {/* Brand mark -- a one-off icon, not part of the shared 3-tier icon
              scale meant for icons repeated across contexts. */}
          <span className="flex h-9 w-9 items-center justify-center rounded-card bg-signal-600 text-graphite-0 shadow-raised">
            <Radar className="h-4 w-4" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-serif text-xl font-semibold text-graphite-950 sm:text-display">
                Diligence Radar
              </h1>
              <span className="hidden sm:inline-block">
                <Badge className="bg-signal-50 text-signal-700">{DEAL_CLIENT}</Badge>
              </span>
            </div>
            <p className="hidden text-micro text-graphite-600 sm:block">
              Cross-workstream risk over a surrogate SEC-filing deal room
            </p>
          </div>
        </div>

        <nav className="ml-auto flex items-center gap-1 rounded-full bg-graphite-100 p-1">
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
      className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-graphite-0 active:scale-[0.98] ${
        active ? "bg-graphite-0 text-signal-700 shadow-raised" : "text-graphite-600 hover:text-graphite-800"
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{children}</span>
    </button>
  );
}
