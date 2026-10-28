from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.docs import router as docs_router
from app.api.health import router as health_router

app = FastAPI(title="Logpilot API")
app.include_router(health_router, prefix="/api")
app.include_router(docs_router, prefix="/api")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
