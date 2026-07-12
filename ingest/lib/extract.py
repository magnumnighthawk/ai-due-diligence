import re
from dataclasses import dataclass

from bs4 import BeautifulSoup

HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
BOLD_TAGS = {"b", "strong"}
BOLD_STYLE_RE = re.compile(r"font-weight\s*:\s*(bold|[6-9]00)")
HIDDEN_STYLE_RE = re.compile(r"display\s*:\s*none|visibility\s*:\s*hidden")
NOISE_TAGS = ("script", "style", "ix:header", "ix:hidden")


def _strip_noise(soup: BeautifulSoup) -> None:
    """Drop machine-only content that isn't part of what a reader sees:
    scripts/styles, inline-XBRL header/hidden blocks (standard in every
    EDGAR filing since ~2019), and anything explicitly display:none. Left
    in, these dump raw XBRL concept names (e.g. "CustomerConcentrationRiskMember")
    as plain text that reads as deceptively on-topic to embedding search.
    """
    for tag in soup.find_all(NOISE_TAGS):
        tag.decompose()
    for tag in soup.find_all(style=True):
        if HIDDEN_STYLE_RE.search(tag["style"]):
            tag.decompose()


@dataclass
class Line:
    text: str
    char_start: int
    char_end: int
    styled_as_heading: bool
    in_table: bool


def _is_heading_styled(node) -> bool:
    depth = 0
    while node is not None and depth < 4:
        name = getattr(node, "name", None)
        if name in HEADING_TAGS or name in BOLD_TAGS:
            return True
        style = node.get("style", "") if hasattr(node, "get") else ""
        if style and BOLD_STYLE_RE.search(style.replace(" ", "")):
            return True
        node = node.parent
        depth += 1
    return False


def _is_in_table(node) -> bool:
    while node is not None:
        if getattr(node, "name", None) == "table":
            return True
        node = node.parent
    return False


def html_to_lines(html: str) -> list[Line]:
    """Flatten filing/contract HTML to text lines, tagging which ones were
    rendered bold or as an HTML heading -- a document-agnostic proxy for
    "this looks like a section title", independent of any numbering scheme
    -- and which ones sit inside a <table>. Numbers, percentages, and column
    headers inside financial/cap tables look identical to short numbered
    headings once flattened to text, so table membership is tracked
    separately and used to exclude them from heading detection entirely,
    regardless of what kind of document (filing, NDA, schedule) it's in.
    """
    soup = BeautifulSoup(html, "html.parser")
    _strip_noise(soup)
    raw_lines: list[tuple[str, bool, bool]] = []
    for node in soup.find_all(string=True):
        if node.parent and node.parent.name in ("script", "style"):
            continue
        text = re.sub(r"[ \t]+", " ", str(node)).strip()
        if not text:
            continue
        raw_lines.append((text, _is_heading_styled(node.parent), _is_in_table(node.parent)))

    lines: list[Line] = []
    offset = 0
    for text, is_heading, in_table in raw_lines:
        start = offset
        end = start + len(text)
        lines.append(Line(text, start, end, is_heading, in_table))
        offset = end + 1  # +1 for the '\n' joining lines
    return lines


def lines_to_text(lines: list[Line]) -> str:
    return "\n".join(l.text for l in lines)


def html_to_text(html: str) -> str:
    return lines_to_text(html_to_lines(html))
