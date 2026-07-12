from dotenv import load_dotenv
from fastapi import FastAPI
from pydantic import BaseModel

load_dotenv()

from .answer import answer_question
from .db import get_conn
from .retrieval import hybrid_search

app = FastAPI(title="AI Due Diligence Acceleration")


@app.get("/health")
def health():
    return {"status": "ok"}


class AskRequest(BaseModel):
    question: str
    workstream: str | None = None
    doc_type: str | None = None
    top_k: int = 8


class Citation(BaseModel):
    marker: int
    doc_id: str
    doc_title: str
    section: str
    char_start: int
    char_end: int
    snippet: str


class AskResponse(BaseModel):
    answer: str
    citations: list[Citation]


@app.post("/ask", response_model=AskResponse)
def ask(req: AskRequest):
    conn = get_conn()
    try:
        chunks = hybrid_search(
            conn, req.question, workstream=req.workstream, doc_type=req.doc_type, top_k=req.top_k
        )
    finally:
        conn.close()

    answer = answer_question(req.question, chunks)
    citations = [
        Citation(
            marker=i,
            doc_id=c.doc_id,
            doc_title=c.doc_title,
            section=c.section,
            char_start=c.char_start,
            char_end=c.char_end,
            snippet=c.text[:280],
        )
        for i, c in enumerate(chunks, start=1)
    ]
    return AskResponse(answer=answer, citations=citations)
