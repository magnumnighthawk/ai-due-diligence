import os

from openai import OpenAI

EMBEDDING_MODEL = "text-embedding-3-small"

_client = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client


def embed_query(text: str) -> list[float]:
    resp = _get_client().embeddings.create(model=EMBEDDING_MODEL, input=[text])
    return resp.data[0].embedding
