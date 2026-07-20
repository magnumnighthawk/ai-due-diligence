import type { ReactNode } from "react";

/*
  Minimal block renderer for LLM-generated prose.

  The models emit genuine structure -- "\n\n" paragraph breaks, "1." / "-"
  list markers, occasional **bold** -- but HTML collapses whitespace, so
  rendering the raw string inline flattens a numbered list into one run-on
  paragraph. This parses that structure back into real <p>/<ol>/<ul>.

  It deliberately is NOT a markdown library: the answer/rationale text also
  carries inline citation markers ([1], #2) that must stay interactive
  buttons wired to the source viewer. Callers own that inline rendering via
  `renderInline`, so citation chips keep working inside list items and
  paragraphs alike.
*/

type Block =
  | { kind: "p"; text: string }
  | { kind: "ol"; items: string[] }
  | { kind: "ul"; items: string[] };

const OL_RE = /^\s*\d+[.)]\s+(.*)$/;
// Requires whitespace after the bullet, so a line opening with "**bold**"
// isn't mistaken for a "*" list item.
const UL_RE = /^\s*[-*•]\s+(.*)$/;

export function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { kind: "ol" | "ul"; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) {
      blocks.push({ kind: "p", text: para.join(" ").trim() });
      para = [];
    }
  };
  const flushList = () => {
    if (list && list.items.length) blocks.push({ kind: list.kind, items: list.items });
    list = null;
  };

  // Models commonly separate list items with a blank line ("\n\n1. …\n\n2. …").
  // A blank line therefore can't immediately end the list, or each item
  // becomes its own <ol> and every marker renders as "1." -- we defer the
  // decision until we see what the next non-blank line actually is.
  let blankSeen = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      blankSeen = true;
      continue;
    }

    const ol = line.match(OL_RE);
    if (ol) {
      flushPara();
      if (!list || list.kind !== "ol") {
        flushList();
        list = { kind: "ol", items: [] };
      }
      list.items.push(ol[1].trim());
      blankSeen = false;
      continue;
    }

    const ul = line.match(UL_RE);
    if (ul) {
      flushPara();
      if (!list || list.kind !== "ul") {
        flushList();
        list = { kind: "ul", items: [] };
      }
      list.items.push(ul[1].trim());
      blankSeen = false;
      continue;
    }

    // Plain line: a wrapped continuation of the open list item, unless a
    // blank line intervened -- then the list really has ended.
    if (list && list.items.length && !blankSeen) {
      list.items[list.items.length - 1] += ` ${line}`;
      continue;
    }
    flushList();
    blankSeen = false;
    para.push(line);
  }

  flushPara();
  flushList();
  return blocks.length ? blocks : [{ kind: "p", text: text.trim() }];
}

// Split a segment on **bold** spans so callers can wrap them, while still
// running their own inline (citation) rendering over the inner text.
export function splitBold(text: string): { bold: boolean; text: string }[] {
  const parts: { bold: boolean; text: string }[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ bold: false, text: text.slice(last, m.index) });
    parts.push({ bold: true, text: m[1] });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ bold: false, text: text.slice(last) });
  return parts.length ? parts : [{ bold: false, text }];
}

export default function RichText({
  text,
  renderInline,
  className = "",
}: {
  text: string;
  /** Renders one text segment, injecting the caller's inline citation chips. */
  renderInline: (segment: string, keyBase: string) => ReactNode;
  className?: string;
}) {
  const blocks = parseBlocks(text);
  return (
    <div className={`space-y-2 ${className}`}>
      {blocks.map((b, i) => {
        if (b.kind === "p") return <p key={i}>{renderInline(b.text, `p${i}`)}</p>;
        const items = b.items.map((item, j) => (
          <li key={j} className="pl-0.5">
            {renderInline(item, `l${i}-${j}`)}
          </li>
        ));
        return b.kind === "ol" ? (
          <ol key={i} className="list-outside list-decimal space-y-1 pl-5 marker:font-mono marker:text-graphite-500">
            {items}
          </ol>
        ) : (
          <ul key={i} className="list-outside list-disc space-y-1 pl-5 marker:text-graphite-400">
            {items}
          </ul>
        );
      })}
    </div>
  );
}
