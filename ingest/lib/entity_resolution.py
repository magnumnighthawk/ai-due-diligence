import re

import psycopg
from rapidfuzz import fuzz

from .embed import embed_texts

FUZZY_THRESHOLD = 70
EMBEDDING_THRESHOLD = 0.75
MIN_MENTION_LEN = 3  # shorter than this (e.g. "A", "B", "C") carries no identifying signal

# Legal/financial documents conventionally define an abbreviation in
# parentheses on first use of a party's full name, e.g.
# `Samsung Display Co., Ltd. ("SDC")`. Bare abbreviations like "SDC" don't
# fuzzy- or embedding-match their full name well on their own (measured: ~7
# token_set_ratio, ~0.30 cosine similarity) -- mining this convention out of
# the source text turns "SDC" into "Samsung Display Co., Ltd." before
# resolution, which is what actually makes the fuzzy/embedding threshold
# step work, rather than fabricating a mapping that isn't in the documents.
ALIAS_RE = re.compile(
    r"([A-Z][A-Za-z.,&'\- ]{2,80}?)\s*\(\s*[“”\"]?\s*([A-Z][A-Za-z]{1,15})\s*[“”\"]?\s*\)"
)


def mine_aliases(conn: psycopg.Connection) -> dict[str, str]:
    with conn.cursor() as cur:
        cur.execute("SELECT raw_text FROM documents")
        texts = [row[0] for row in cur.fetchall()]

    candidates: dict[str, list[str]] = {}
    for text in texts:
        for m in ALIAS_RE.finditer(text):
            full, abbrev = m.group(1).strip(), m.group(2).strip()
            if len(full.split()) < 2:
                continue
            candidates.setdefault(abbrev.upper(), []).append(full)

    # Noise mostly adds extra leading words to the captured full name (the
    # regex anchors on the closing parenthesis, not the true start of the
    # name), so the shortest candidate for a given abbreviation is the
    # cleanest.
    return {abbrev: min(names, key=len) for abbrev, names in candidates.items()}


def _resolve_mention(mention: str, aliases: dict[str, str]) -> str:
    return aliases.get(mention.upper(), mention)


def _load_entities(conn: psycopg.Connection) -> list[tuple[int, str]]:
    with conn.cursor() as cur:
        cur.execute("SELECT id, canonical_name FROM entities")
        return cur.fetchall()


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(y * y for y in b) ** 0.5
    return dot / (norm_a * norm_b)


def _best_match(
    name: str, name_embedding: list[float], entities: list[tuple[int, str]], entity_embeddings: dict[int, list[float]]
) -> tuple[int, float, str] | None:
    """Score `name` against every known canonical entity with both rapidfuzz
    and embedding cosine similarity, and match if EITHER signal clears its
    threshold -- string similarity catches exact/near-exact name variants,
    embeddings catch paraphrases fuzzy matching can't (and vice versa: an
    abbreviation resolved via mine_aliases() becomes an exact string match,
    which fuzzy handles perfectly without needing embeddings at all).

    Uses plain fuzz.ratio (whole-string, case-insensitive), not
    token_set_ratio/partial_ratio: measured on this corpus, those scored
    "LG Display" vs "Samsung Display Co., Ltd." at 80-82/100 -- a false
    match -- purely because both share the generic token "Display". Plain
    ratio separates that case (46) from real near-duplicates (93-100)
    cleanly since it weighs the whole string, not just token overlap.
    """
    best: tuple[int, float, str] | None = None
    for entity_id, canonical_name in entities:
        fuzzy = fuzz.ratio(name.lower(), canonical_name.lower()) / 100
        embedding_sim = _cosine(name_embedding, entity_embeddings[entity_id])
        passes = fuzzy * 100 >= FUZZY_THRESHOLD or embedding_sim >= EMBEDDING_THRESHOLD
        score = max(fuzzy, embedding_sim)
        if passes and (best is None or score > best[1]):
            signal = "fuzzy" if fuzzy * 100 >= FUZZY_THRESHOLD else "embedding"
            best = (entity_id, score, signal)
    return best


def _create_entity(conn: psycopg.Connection, canonical_name: str, kind: str) -> int:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO entities (canonical_name, kind) VALUES (%s, %s) RETURNING id",
            (canonical_name, kind),
        )
        return cur.fetchone()[0]


def _set_finding_resolution(conn: psycopg.Connection, finding_id: int, entity_id: int | None, review_status: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE findings SET entity_id = %s, review_status = %s WHERE id = %s",
            (entity_id, review_status, finding_id),
        )


def resolve_entities(conn: psycopg.Connection) -> dict[str, int]:
    aliases = mine_aliases(conn)

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, workstream, payload FROM findings
            WHERE workstream = 'financial' AND kind = 'customer_concentration'
               OR workstream = 'commercial' AND kind = 'contract_clause'
            ORDER BY workstream = 'commercial' DESC, id  -- resolve full-name-bearing contract mentions first
            """
        )
        rows = cur.fetchall()

    stats = {"linked": 0, "needs_review": 0, "created": 0}
    entities = _load_entities(conn)
    entity_embeddings: dict[int, list[float]] = {}
    if entities:
        vecs = embed_texts([c for _, c in entities])
        entity_embeddings = {eid: vec for (eid, _), vec in zip(entities, vecs)}

    for finding_id, workstream, payload in rows:
        mention = payload["counterparty"] if workstream == "commercial" else payload["customer_name"]

        if len(mention) < MIN_MENTION_LEN:
            _set_finding_resolution(conn, finding_id, None, "needs_review")
            stats["needs_review"] += 1
            continue

        resolved_name = _resolve_mention(mention, aliases)
        name_embedding = embed_texts([resolved_name])[0]

        match = _best_match(resolved_name, name_embedding, entities, entity_embeddings)
        if match is not None:
            entity_id, _, _ = match
            _set_finding_resolution(conn, finding_id, entity_id, "auto")
            stats["linked"] += 1
        else:
            entity_id = _create_entity(conn, resolved_name, "company")
            entities.append((entity_id, resolved_name))
            entity_embeddings[entity_id] = name_embedding
            _set_finding_resolution(conn, finding_id, entity_id, "auto")
            stats["created"] += 1

    conn.commit()
    return stats
