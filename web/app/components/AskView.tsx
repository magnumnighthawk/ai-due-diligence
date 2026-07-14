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
import { ICON_DEFAULT, ICON_INLINE } from "./icons";

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
    // flex-col on mobile/tablet (source panel stacks below, always in the DOM)
    // -> grid at lg: (side-by-side), mirroring RegisterView's stacking pattern.
    // lg: (not md:) because the two columns' combined min-width (800px)
    // exceeds a 768px tablet viewport, which clips the panel under overflow-hidden.
    // Previously the source panel was `hidden md:flex`: below 768px it was
    // removed from the DOM entirely, so a mobile user could click a citation
    // (which did fetch the doc) but could never see the highlighted span --
    // a broken feature, not graceful degradation.
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden bg-graphite-50 p-4 lg:grid lg:grid-cols-[minmax(420px,1fr)_minmax(380px,1fr)]">
      {/* Conversation + composer */}
      <section className="flex min-h-0 flex-col overflow-hidden rounded-card bg-graphite-0 shadow-card">
        <PanelHeader icon={<Sparkles className={ICON_DEFAULT} />}>Ask the deal room</PanelHeader>

        <div ref={threadRef} className="flex-1 overflow-y-auto px-5 py-5">
          {messages.length === 0 ? (
            <div className="mx-auto max-w-md pt-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-card bg-signal-100 text-signal-600">
                <Sparkles className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold text-graphite-800">
                Ask a question, get a cited answer
              </h2>
              <p className="mt-1.5 text-body text-graphite-600">
                Answers are grounded only in the retrieved filings. When the corpus can&apos;t answer,
                the assistant says so rather than guessing.
              </p>
              <div className="mt-5 space-y-2 text-left">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => ask(ex)}
                    className="w-full rounded-card border border-graphite-200 bg-graphite-0 px-3.5 py-2.5 text-left text-body text-graphite-700 shadow-raised transition-all duration-150 hover:shadow-lifted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-graphite-50 active:scale-[0.99]"
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
          className="border-t border-graphite-200 bg-graphite-0 p-3.5"
        >
          <div className="flex items-end gap-2 rounded-card border border-graphite-300 bg-graphite-0 px-3.5 py-2.5 shadow-raised focus-within:border-signal-400 focus-within:ring-2 focus-within:ring-signal-200">
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
              // Visual focus is delegated to the wrapping div's focus-within
              // ring above (which does fire, since :focus-within triggers
              // from a focused descendant) -- so a bare focus:outline-none
              // here is intentional, not a missed focus style.
              className="max-h-32 flex-1 resize-none bg-transparent text-body text-graphite-800 placeholder:text-graphite-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="flex h-9 items-center gap-1 rounded-card bg-signal-600 px-3.5 text-xs font-semibold text-graphite-0 transition-all duration-150 hover:bg-signal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-500 focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-graphite-200 disabled:text-graphite-500 disabled:active:scale-100"
            >
              Ask
              <CornerDownLeft className={ICON_DEFAULT} />
            </button>
          </div>
        </form>
      </section>

      {/* Source panel -- always rendered (see mobile-stacking note above),
          not conditionally hidden below md. */}
      <section className="flex min-h-0 flex-col overflow-hidden rounded-card bg-graphite-0 shadow-card">
        <PanelHeader icon={<FileText className={ICON_DEFAULT} />}>Source document</PanelHeader>
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
          <div className="rounded-bubble rounded-tr-sm bg-signal-600 px-4 py-2.5 text-body text-graphite-0 shadow-raised">
            {message.text}
          </div>
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-graphite-200 text-graphite-600">
            <User className={ICON_DEFAULT} />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-signal-100 text-signal-600">
        <Sparkles className={ICON_DEFAULT} />
      </span>
      <div className="min-w-0 flex-1">
        {message.loading ? (
          <div className="flex items-center gap-1.5 py-1 text-body text-graphite-600">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal-500 motion-reduce:animate-none" />
            <span className="ml-1 text-xs">searching the filings…</span>
          </div>
        ) : message.abstained ? (
          <div className="rounded-bubble rounded-tl-sm bg-amber-50 px-4 py-2.5 text-body text-amber-800 shadow-raised">
            {message.text}
            <div className="mt-1.5 text-xs font-medium text-amber-600">
              No sufficient evidence in the corpus — abstained rather than guessing.
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-bubble rounded-tl-sm border border-graphite-200 bg-graphite-0 px-4 py-2.5 text-body leading-relaxed text-graphite-700 shadow-raised">
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
          className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-signal-100 px-1.5 align-super font-mono text-micro font-semibold text-signal-700 transition-colors duration-150 hover:bg-signal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-500 focus-visible:ring-offset-1 active:scale-95"
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
          icon={<Quote className={ICON_INLINE} />}
          citations={cited}
          onCite={onCite}
          activeCitation={activeCitation}
        />
      )}
      {related.length > 0 && (
        <details className="group" open={cited.length === 0}>
          <summary className="flex cursor-pointer list-none items-center gap-1 rounded-chip text-micro font-semibold uppercase tracking-wide text-graphite-600 transition-colors duration-150 hover:text-graphite-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-500 focus-visible:ring-offset-2">
            <ChevronRight className={`${ICON_INLINE} transition-transform group-open:rotate-90`} />
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
      <div className="flex items-center gap-1 text-micro font-semibold uppercase tracking-wide text-graphite-600">
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
      className={`flex w-full items-start gap-2.5 rounded-card border px-3 py-2 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-graphite-0 active:scale-[0.99] ${
        active
          ? "border-signal-400 bg-signal-50/60"
          : muted
            ? "border-transparent bg-graphite-50 hover:bg-graphite-100"
            : "border-graphite-200 bg-graphite-0 shadow-raised hover:shadow-lifted"
      }`}
    >
      <span
        className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-micro font-semibold ${
          muted ? "bg-graphite-100 text-graphite-600" : "bg-signal-100 text-signal-700"
        }`}
      >
        {c.marker}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-graphite-700">
          {c.doc_title} · {c.section}
        </span>
        <span className="line-clamp-2 text-xs text-graphite-600">{c.snippet}</span>
      </span>
    </button>
  );
}
