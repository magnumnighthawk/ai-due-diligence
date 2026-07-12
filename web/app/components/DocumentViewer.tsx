"use client";

import { useEffect, useRef } from "react";
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

  useEffect(() => {
    markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlight, doc.id]);

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
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {doc.title}
        </div>
        <a
          href={doc.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:underline dark:text-blue-400"
        >
          {doc.doc_type} · view original filing ↗
        </a>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
          {before}
          {cited && (
            <mark
              ref={markRef}
              className="rounded bg-yellow-200 px-0.5 text-zinc-900 dark:bg-yellow-500/40 dark:text-yellow-50"
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
