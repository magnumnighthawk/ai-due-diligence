import os

from openai import OpenAI

from .retrieval import RetrievedChunk

CHAT_MODEL = "gpt-4o-mini"

SYSTEM_PROMPT = """You are a due-diligence research assistant. Answer the user's question using ONLY the
numbered source excerpts provided below -- never rely on outside knowledge. Every claim in your answer must
be followed by a citation marker like [1] referring to the excerpt it came from.

If the excerpts don't contain enough information to answer, say exactly that ("insufficient evidence in the
retrieved documents to answer this") rather than guessing."""

_client = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client


def _build_context(chunks: list[RetrievedChunk]) -> str:
    parts = []
    for i, c in enumerate(chunks, start=1):
        parts.append(f"[{i}] ({c.doc_title} -- {c.section})\n{c.text}")
    return "\n\n".join(parts)


def answer_question(question: str, chunks: list[RetrievedChunk]) -> str:
    if not chunks:
        return "insufficient evidence in the retrieved documents to answer this"

    context = _build_context(chunks)
    resp = _get_client().chat.completions.create(
        model=CHAT_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Question: {question}\n\nSource excerpts:\n{context}"},
        ],
        temperature=0,
    )
    return resp.choices[0].message.content
