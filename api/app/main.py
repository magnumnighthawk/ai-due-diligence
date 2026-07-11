from fastapi import FastAPI

app = FastAPI(title="AI Due Diligence Acceleration")


@app.get("/health")
def health():
    return {"status": "ok"}
