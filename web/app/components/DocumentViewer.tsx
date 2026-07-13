"use client";

import { useEffect, useRef } from "react";
import { ExternalLink, FileText } from "lucide-react";
import type { DocumentDetail } from "../lib/api";

type Props = {
  doc: DocumentDetail;
  highlight: { char_start: number; char_end: number } | null;
};

// Slice the raw document text on the cited char offsets and wrap the cited
// span in <mark>. This is the trust feature: the exact bytes the finding was
// drawn from, shown in the real source, not a paraphrase.
export default function DocumentViewer({ doc, highlight }: Props) {
  const markRef = useRef<HTMLElement | null>(null);

  // Scroll the cited span into view. Key on primitive offsets (not the
  // freshly-allocated highlight object) so this fires only on a real change.
  // A synchronous scroll covers the common case; a timer backstop covers a
  // first paint where the very large <pre> hasn't finished laying out yet.
  // (Deliberately not requestAnimationFrame: rAF is paused in backgrounded
  // tabs, so timers are the reliable choice.)
  useEffect(() => {
    const scroll = () => markRef.current?.scrollIntoView({ block: "center" });
    scroll();
    // Backstops for a first mount where the very large <pre> is still laying
    // out. Timers (not rAF, which is paused in backgrounded tabs) at a couple
    // of intervals reliably re-center once layout settles.
    const timers = [setTimeout(scroll, 60), setTimeout(scroll, 250)];
    return () => timers.forEach(clearTimeout);
  }, [doc.id, highlight?.char_start, highlight?.char_end]);

  const text = doc.raw_text;
  let before = text;
  let cited = "";
  let after = "";

  if (
    highlight &&
    highlight.char_start >= 0 &&
    highlight.char_end <= text.length &&
    highlight.char_start < highlight.char_end
  ) {
    before = text.slice(0, highlight.char_start);
    cited = text.slice(highlight.char_start, highlight.char_end);
    after = text.slice(highlight.char_end);
  }

  return (
    // flex-1 + min-h-0 (not h-full): fills the space *below* the panel's
    // sticky header instead of taking 100% of the panel and overlapping it.
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex items-start gap-2.5 border-b border-slate-200 px-4 py-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
          <FileText className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{doc.title}</div>
          <a
            href={doc.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
          >
            <span className="uppercase tracking-wide text-slate-400">{doc.doc_type}</span>
            · view original filing
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-600">
          {before}
          {cited && (
            <mark
              ref={markRef}
              className="rounded-sm bg-amber-200/80 px-0.5 py-px text-slate-900 shadow-[0_0_0_1px_rgba(245,158,11,0.4)]"
            >
              {cited}
            </mark>
          )}
          {after}
        </pre>
      </div>
    </div>
  );
}
