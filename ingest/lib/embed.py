import os

from openai import OpenAI

EMBEDDING_MODEL = "text-embedding-3-small"
BATCH_SIZE = 100

_client = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client


def embed_texts(texts: list[str]) -> list[list[float]]:
    client = _get_client()
    vectors: list[list[float]] = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i : i + BATCH_SIZE]
        resp = client.embeddings.create(model=EMBEDDING_MODEL, input=batch)
        vectors.extend(d.embedding for d in resp.data)
    return vectors
