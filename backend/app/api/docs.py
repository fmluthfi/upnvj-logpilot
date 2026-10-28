from datetime import date
import re
from typing import Literal
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.google_docs_auth import (
    GoogleDocsAuthorizationRequired,
    GoogleOAuthAlreadyRunning,
    GoogleOAuthNotConfigured,
    get_connection_status,
    get_google_credentials,
    start_oauth_flow,
)
from app.services.google_docs_client import GoogleDocsReadError, get_document
from app.services.google_docs_parser import parse_document
from app.services.logbook_coverage import build_coverage
from app.services.logbook_sync import persist_source_rows


router = APIRouter(prefix="/docs", tags=["Google Docs"])
_DOCUMENT_ID = re.compile(r"^[A-Za-z0-9_-]{10,256}$")


class SyncRequest(BaseModel):
    document_url: str = Field(min_length=1, max_length=2048)
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def validate_date_range(self):
        if self.start_date > self.end_date:
            raise ValueError("Tanggal mulai harus sama dengan atau sebelum tanggal akhir.")
        return self


@router.get("/status")
def docs_status() -> dict[str, str | bool]:
    return get_connection_status()


@router.post("/connect")
def connect_docs() -> dict[str, str]:
    try:
        return {"state": start_oauth_flow()}
    except GoogleOAuthNotConfigured as error:
        raise HTTPException(
            status_code=409,
            detail="File OAuth belum dipasang. Ikuti bagian Google Docs di README.",
        ) from error
    except GoogleOAuthAlreadyRunning as error:
        raise HTTPException(status_code=409, detail="Koneksi Google Docs sedang berjalan.") from error


@router.post("/sync")
def sync_docs(request: SyncRequest, session: Session = Depends(get_db)) -> dict:
    try:
        document_id = extract_document_id(request.document_url)
    except ValueError as error:
        raise HTTPException(
            status_code=422,
            detail="Masukkan URL dokumen Google Docs atau ID dokumen yang valid.",
        ) from error

    try:
        credentials = get_google_credentials()
    except GoogleDocsAuthorizationRequired as error:
        raise HTTPException(status_code=409, detail="Hubungkan Google Docs sebelum sinkronisasi.") from error

    try:
        document = get_document(document_id, credentials)
        rows = parse_document(document)
    except GoogleDocsReadError as error:
        raise HTTPException(
            status_code=502,
            detail="Dokumen tidak dapat dibaca. Periksa akses dokumen dan koneksi Google.",
        ) from error
    except (KeyError, TypeError, ValueError) as error:
        raise HTTPException(
            status_code=422,
            detail="Struktur tabel dokumen belum dapat dibaca dengan aman.",
        ) from error

    sync_counts = persist_source_rows(
        session,
        document_id,
        rows,
        request.start_date,
        request.end_date,
    )
    coverage = build_coverage(
        request.start_date,
        request.end_date,
        rows,
        set(sync_counts.conflicts),
    )
    return {
        "start_date": request.start_date,
        "end_date": request.end_date,
        "summary": coverage.summary,
        "days": [
            {
                "date": day.date,
                "status": day.status,
                "row_count": day.row_count,
                "entries": day.entries,
            }
            for day in coverage.days
        ],
        "sync": {
            "created": sync_counts.created,
            "updated": sync_counts.updated,
            "unchanged": sync_counts.unchanged,
            "conflicts": sync_counts.conflict_count,
        },
    }


def extract_document_id(value: str) -> str:
    candidate = value.strip()
    if _DOCUMENT_ID.fullmatch(candidate):
        return candidate

    parsed = urlsplit(candidate)
    if parsed.scheme != "https" or parsed.hostname != "docs.google.com":
        raise ValueError("Not a Google Docs URL")
    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) < 3 or parts[:2] != ["document", "d"] or not _DOCUMENT_ID.fullmatch(parts[2]):
        raise ValueError("Not a Google Docs document URL")
    return parts[2]
