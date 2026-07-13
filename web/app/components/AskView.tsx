"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight, CornerDownLeft, FileText, Quote, Sparkles, User } from "lucide-react";
import {
  fetchAsk,
  fetchDocument,
  isAbstention,
  type Citation,
  type DocumentDetail,
} from "../lib/api";
import DocumentViewer from "./DocumentViewer";
import { PanelHeader, Empty } from "./panels";

type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  citations?: Citation[];
  loading?: boolean;
  abstained?: boolean;
};

const EXAMPLES = [
  "What is the customer concentration disclosed in the filings?",
  "Can the Samsung license agreement be assigned on a change of control?",
  "What was Universal Display's stock price on 15 March 2024?",
];

export default function AskView({ onError }: { onError: (msg: string) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    const userMsg: Message = { id: nextId.current++, role: "user", text: q };
    const loadingMsg: Message = { id: nextId.current++, role: "assistant", text: "", loading: true };
    setMessages((m) => [...m, userMsg, loadingMsg]);

    try {
      const res = await fetchAsk(q);
      setMessages((m) =>
        m.map((msg) =>
          msg.id === loadingMsg.id
            ? {
                ...msg,
                loading: false,
                text: res.answer,
                citations: res.citations,
                abstained: isAbstention(res.answer),
              }
            : msg,
        ),
      );
    } catch (e) {
      onError(String(e));
      setMessages((m) =>
        m.map((msg) =>
          msg.id === loadingMsg.id
            ? { ...msg, loading: false, text: "Request failed — is the API running?" }
            : msg,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function openCitation(c: Citation) {
    setActiveCitation(c);
    try {
      if (!doc || doc.id !== c.doc_id) setDoc(await fetchDocument(c.doc_id));
    } catch (e) {
      onError(String(e));
    }
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[minmax(420px,1fr)_minmax(380px,1fr)]">
      {/* Conversation + composer */}
      <section className="flex min-h-0 flex-col border-r border-slate-200 bg-slate-50/50">
        <PanelHeader icon={<Sparkles className="h-3.5 w-3.5" />}>Ask the deal room</PanelHeader>

        <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <div className="mx-auto max-w-md pt-8 text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                <Sparkles className="h-5 w-5" />
              </div>
              <h2 className="text-sm font-semibold text-slate-800">
                Ask a question, get a cited answer
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Answers are grounded only in the retrieved filings. When the corpus can&apos;t answer,
                the assistant says so rather than guessing.
              </p>
              <div className="mt-4 space-y-2 text-left">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => ask(ex)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50/50"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} onCite={openCitation} activeCitation={activeCitation} />
              ))}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="border-t border-slate-200 bg-white p-3"
        >
          <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-200">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(input);
                }
              }}
              rows={1}
              placeholder="Ask about concentration, contracts, personnel…"
              className="max-h-32 flex-1 resize-none bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="flex h-8 items-center gap-1 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              Ask
              <CornerDownLeft className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      </section>

      {/* Source panel */}
      <section className="hidden min-h-0 flex-col overflow-hidden bg-white md:flex">
        <PanelHeader icon={<FileText className="h-3.5 w-3.5" />}>Source document</PanelHeader>
        {!doc || !activeCitation ? (
          <Empty>Click a citation to view its cited span in the source.</Empty>
        ) : (
          <DocumentViewer
            doc={doc}
            highlight={{ char_start: activeCitation.char_start, char_end: activeCitation.char_end }}
          />
        )}
      </section>
    </div>
  );
}

function MessageBubble({
  message,
  onCite,
  activeCitation,
}: {
  message: Message;
  onCite: (c: Citation) => void;
  activeCitation: Citation | null;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] items-start gap-2">
          <div className="rounded-2xl rounded-tr-sm bg-indigo-600 px-3.5 py-2 text-sm text-white">
            {message.text}
          </div>
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500">
            <User className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        {message.loading ? (
          <div className="flex items-center gap-1.5 py-1 text-sm text-slate-400">
            <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
            <span className="ml-1 text-xs">searching the filings…</span>
          </div>
        ) : message.abstained ? (
          <div className="rounded-2xl rounded-tl-sm border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm text-amber-800">
            {message.text}
            <div className="mt-1 text-[11px] font-medium text-amber-600">
              No sufficient evidence in the corpus — abstained rather than guessing.
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-3.5 py-2 text-sm leading-relaxed text-slate-700">
              <AnswerText text={message.text} citations={message.citations ?? []} onCite={onCite} />
            </div>
            {message.citations && message.citations.length > 0 && (
              <CitationList
                citations={message.citations}
                citedMarkers={extractCitedMarkers(message.text)}
                onCite={onCite}
                activeCitation={activeCitation}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Render an answer, turning inline [N] markers into clickable chips that open
// citation N in the source panel.
function AnswerText({
  text,
  citations,
  onCite,
}: {
  text: string;
  citations: Citation[];
  onCite: (c: Citation) => void;
}) {
  const byMarker = new Map(citations.map((c) => [c.marker, c]));
  const nodes: ReactNode[] = [];
  const regex = /\[(\d+)\]/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) nodes.push(<Fragment key={key++}>{text.slice(last, match.index)}</Fragment>);
    const c = byMarker.get(Number(match[1]));
    if (c) {
      nodes.push(
        <button
          key={key++}
          onClick={() => onCite(c)}
          title={`${c.doc_title} — ${c.section}`}
          className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-indigo-100 px-1 align-super text-[10px] font-semibold text-indigo-700 hover:bg-indigo-200"
        >
          {match[1]}
        </button>,
      );
    } else {
      nodes.push(<Fragment key={key++}>{match[0]}</Fragment>);
    }
    last = regex.lastIndex;
  }
  if (last < text.length) nodes.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return <>{nodes}</>;
}

// Collect the [N] markers the answer text actually references.
function extractCitedMarkers(text: string): Set<number> {
  const markers = new Set<number>();
  for (const m of text.matchAll(/\[(\d+)\]/g)) markers.add(Number(m[1]));
  return markers;
}

// Split retrieved sources into those the answer actually cited vs. the rest
// (retrieved and relevant, but not referenced). Showing them separately keeps
// "what the answer stands on" honest and distinct from "what else came back".
function CitationList({
  citations,
  citedMarkers,
  onCite,
  activeCitation,
}: {
  citations: Citation[];
  citedMarkers: Set<number>;
  onCite: (c: Citation) => void;
  activeCitation: Citation | null;
}) {
  const cited = citations.filter((c) => citedMarkers.has(c.marker));
  const related = citations.filter((c) => !citedMarkers.has(c.marker));

  return (
    <div className="mt-2 space-y-2">
      {cited.length > 0 && (
        <CitationGroup
          label="Cited"
          icon={<Quote className="h-3 w-3" />}
          citations={cited}
          onCite={onCite}
          activeCitation={activeCitation}
        />
      )}
      {related.length > 0 && (
        <details className="group" open={cited.length === 0}>
          <summary className="flex cursor-pointer list-none items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-500">
            <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
            Related · {related.length}
          </summary>
          <div className="mt-1.5 space-y-1.5">
            {related.map((c) => (
              <CitationRow key={c.marker} citation={c} onCite={onCite} activeCitation={activeCitation} muted />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function CitationGroup({
  label,
  icon,
  citations,
  onCite,
  activeCitation,
}: {
  label: string;
  icon: ReactNode;
  citations: Citation[];
  onCite: (c: Citation) => void;
  activeCitation: Citation | null;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {icon} {label}
      </div>
      {citations.map((c) => (
        <CitationRow key={c.marker} citation={c} onCite={onCite} activeCitation={activeCitation} />
      ))}
    </div>
  );
}

function CitationRow({
  citation: c,
  onCite,
  activeCitation,
  muted = false,
}: {
  citation: Citation;
  onCite: (c: Citation) => void;
  activeCitation: Citation | null;
  muted?: boolean;
}) {
  const active = activeCitation?.marker === c.marker && activeCitation?.doc_id === c.doc_id;
  return (
    <button
      onClick={() => onCite(c)}
      className={`flex w-full items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
        active
          ? "border-indigo-400 bg-indigo-50/60"
          : muted
            ? "border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-white"
            : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <span
        className={`flex h-4 min-w-4 items-center justify-center rounded px-1 text-[10px] font-semibold ${
          muted ? "bg-slate-100 text-slate-400" : "bg-indigo-100 text-indigo-700"
        }`}
      >
        {c.marker}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-medium text-slate-600">
          {c.doc_title} · {c.section}
        </span>
        <span className="line-clamp-2 text-[11px] text-slate-400">{c.snippet}</span>
      </span>
    </button>
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300"
      style={{ animationDelay: delay }}
    />
  );
}
