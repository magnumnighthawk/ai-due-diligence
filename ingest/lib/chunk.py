import re
from dataclasses import dataclass

from .extract import Line, lines_to_text

MAX_CHUNK_CHARS = 1500
MAX_HEADING_LINE_LEN = 100

# Gap (in chars) below which two heading candidates are treated as fragments
# of the same title -- EDGAR/Word HTML routinely splits "ITEM 1A." and
# "RISK FACTORS" (or a drop-cap first letter) into separate text nodes.
MERGE_GAP = 80

# Gap below which consecutive heading candidates are assumed to be a table
# of contents / index rather than real section bodies.
TOC_GAP_THRESHOLD = 1000

# Heading signals, in rough order of specificity. These deliberately cover
# more than SEC filings -- "Article", "Section", "Schedule", roman numerals,
# and generic numbered/lettered outline styles -- since a live VDR mixes
# EDGAR-style filings with Word-exported NDAs, side letters, and purchase
# agreements that use different conventions.
ITEM_RE = re.compile(r"^item\s+\d{1,3}[a-c]?(\.\d{1,2})?\b", re.IGNORECASE)
LEGAL_WORD_RE = re.compile(r"^(article|section|schedule|exhibit|clause|annex|appendix)\s+([ivxlcdm]+|\d{1,3})\b", re.IGNORECASE)
NUMBERED_BARE_RE = re.compile(r"^\(?\d{1,3}(\.\d{1,3}){0,3}\)?\.?\s*$")
NUMBERED_WITH_TITLE_RE = re.compile(r"^\(?\d{1,3}(\.\d{1,3}){0,3}\)?\.\s+[A-Z\"“]")
ALLCAPS_RE = re.compile(r"^[A-Z0-9][A-Z0-9 &,\-'\.:;()/]*[A-Z0-9)]$")
NON_TITLE_RE = re.compile(r"^[\$%\d,.\s()]+$")  # purely numeric/currency/punctuation


def _is_allcaps_heading(text: str) -> bool:
    if not (3 <= len(text) <= MAX_HEADING_LINE_LEN):
        return False
    if sum(c.isalpha() for c in text) < 3:
        return False
    return bool(ALLCAPS_RE.match(text))


def _looks_like_title(text: str) -> bool:
    if len(text) < 4:
        return False
    return not NON_TITLE_RE.match(text)


def _is_heading_candidate(lines: list[Line], i: int) -> bool:
    line = lines[i]
    text = line.text
    if line.in_table:
        return False
    # "Item N.NN <title>" headings (8-Ks, 10-Ks) can run long -- the item
    # prefix itself is unambiguous, so it's exempt from the length gate that
    # guards the weaker signals below from matching stray prose lines.
    if ITEM_RE.match(text) or LEGAL_WORD_RE.match(text):
        return True
    if len(text) > MAX_HEADING_LINE_LEN:
        return False
    if NUMBERED_WITH_TITLE_RE.match(text):
        return True
    if NUMBERED_BARE_RE.match(text):
        # A bare number/outline marker is only a heading if what follows
        # reads like a title, not another number -- otherwise it's almost
        # always a table figure or list marker that survived table-stripping
        # (e.g. inline numbering outside a <table> tag).
        nxt = lines[i + 1] if i + 1 < len(lines) else None
        return nxt is not None and not nxt.in_table and _looks_like_title(nxt.text)
    if _is_allcaps_heading(text):
        return True
    if line.styled_as_heading and " " in text and len(text) <= 80 and not text.endswith((",", ";")):
        return True
    return False


def _merge_adjacent(positions: list[int]) -> list[int]:
    merged: list[int] = []
    for pos in positions:
        if merged and pos - merged[-1] < MERGE_GAP:
            continue
        merged.append(pos)
    return merged


def _drop_toc_cluster(positions: list[int]) -> list[int]:
    for i in range(1, len(positions)):
        if positions[i] - positions[i - 1] > TOC_GAP_THRESHOLD:
            return positions[i - 1 :]
    return positions


def _drop_recurring(lines: list[Line], positions: list[int]) -> list[int]:
    """Drop candidates whose exact text recurs several times -- a real
    section title appears once; a repeated one is a table/column header or
    running footer that slipped past the in-table check."""
    by_pos = {l.char_start: l.text.strip().lower() for l in lines}
    counts: dict[str, int] = {}
    for pos in positions:
        t = by_pos.get(pos, "")
        counts[t] = counts.get(t, 0) + 1
    return [p for p in positions if counts.get(by_pos.get(p, ""), 0) < 3]


def _heading_label(text: str, start: int) -> str:
    """Build a human-readable label for a heading, stitching together
    consecutive short lines -- e.g. a bare "5" followed by "Business and
    Geographic Markets" on the next line, a split common enough in
    EDGAR/Word-exported HTML that a single-line grab isn't reliable."""
    parts: list[str] = []
    pos = start
    for _ in range(3):
        line_end = text.find("\n", pos)
        line = text[pos : line_end if line_end != -1 else pos + 80].strip()
        if not line:
            break
        parts.append(line)
        if len(" ".join(parts)) >= 8:
            break
        if line_end == -1:
            break
        pos = line_end + 1
    return " ".join(parts)[:120]


@dataclass
class Chunk:
    section: str
    char_start: int
    char_end: int
    text: str


def _cap_section(text: str, section: str, start: int, end: int) -> list[Chunk]:
    """Sub-split an oversized section on line boundaries, never mid-line."""
    lines = text[start:end].split("\n")
    chunks: list[Chunk] = []
    cur_lines: list[str] = []
    cur_len = 0
    cur_start = start
    offset = start

    def flush(end_offset: int):
        nonlocal cur_lines, cur_len, cur_start
        if cur_lines:
            chunk_text = "\n".join(cur_lines).strip()
            if chunk_text:
                chunks.append(Chunk(section, cur_start, end_offset, chunk_text))
        cur_lines = []
        cur_len = 0

    for line in lines:
        line_len = len(line) + 1
        if cur_len + line_len > MAX_CHUNK_CHARS and cur_lines:
            flush(offset)
            cur_start = offset
        cur_lines.append(line)
        cur_len += line_len
        offset += line_len

    flush(end)
    return chunks or [Chunk(section, start, end, text[start:end].strip())]


def chunk_lines(lines: list[Line]) -> list[Chunk]:
    """Section-aware chunking driven by generic structural signals (numbered/
    lettered/roman headings, SEC Item headings, ALL-CAPS lines, bold/<h*>
    styling) rather than any single document convention. Falls back to
    fixed-size, line-respecting windows for stretches with no detected
    structure (e.g. an unstructured memo) or oversized sections.
    """
    text = lines_to_text(lines)
    candidates = [lines[i].char_start for i in range(len(lines)) if _is_heading_candidate(lines, i)]
    candidates = _drop_recurring(lines, candidates)
    candidates = _merge_adjacent(candidates)
    candidates = _drop_toc_cluster(candidates)

    if not candidates:
        sections = [("document", 0, len(text))]
    else:
        bounds = candidates + [len(text)]
        sections = [
            (_heading_label(text, bounds[i]), bounds[i], bounds[i + 1])
            for i in range(len(candidates))
        ]
        if candidates[0] > 0:
            sections.insert(0, ("preamble", 0, candidates[0]))

    chunks: list[Chunk] = []
    for section, start, end in sections:
        if end - start < 20:
            continue
        chunks.extend(_cap_section(text, section, start, end))
    return chunks


def chunk_document(text_or_lines) -> list[Chunk]:
    if isinstance(text_or_lines, str):
        offset = 0
        lines = []
        for t in text_or_lines.split("\n"):
            lines.append(Line(t, offset, offset + len(t), False, False))
            offset += len(t) + 1
    else:
        lines = text_or_lines
    return chunk_lines(lines)
