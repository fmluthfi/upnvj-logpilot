from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.docs import router as docs_router
from app.api.entries import router as entries_router
from app.api.extension import router as extension_router
from app.api.health import router as health_router
from app.api.reflections import router as reflections_router
from app.api.runs import router as runs_router

api = FastAPI(title="Logpilot API")
api.include_router(health_router, prefix="/api")
api.include_router(docs_router, prefix="/api")
api.include_router(entries_router, prefix="/api")
api.include_router(extension_router, prefix="/api")
api.include_router(reflections_router, prefix="/api")
api.include_router(runs_router, prefix="/api")
app = CORSMiddleware(
    api,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)
