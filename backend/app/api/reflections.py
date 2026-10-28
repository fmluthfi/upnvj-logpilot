from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.reflection_service import (
    ReflectionError,
    approve_week_reflection,
    generate_week_reflection,
    get_week_reflection,
    save_week_reflection,
)


router = APIRouter(prefix="/reflections", tags=["Weekly reflections"])


class ReflectionSourceRequest(BaseModel):
    source_hash: str = Field(pattern=r"^[a-f0-9]{64}$")


class ReflectionDraftRequest(ReflectionSourceRequest):
    reflection_text: str = Field(max_length=1500)
    source_reviewed: bool = False


class ReflectionGenerateRequest(ReflectionSourceRequest):
    privacy_confirmed: bool
    regenerate: bool = False


@router.get("/{friday}")
def read_week_reflection(friday: date, session: Session = Depends(get_db)) -> dict:
    return _run(get_week_reflection, session, friday)


@router.patch("/{friday}")
def update_week_reflection(
    friday: date,
    update: ReflectionDraftRequest,
    session: Session = Depends(get_db),
) -> dict:
    return _run(
        save_week_reflection,
        session,
        friday,
        update.reflection_text,
        update.source_hash,
        update.source_reviewed,
    )


@router.post("/{friday}/generate")
def create_week_reflection(
    friday: date,
    request: ReflectionGenerateRequest,
    session: Session = Depends(get_db),
) -> dict:
    return _run(
        generate_week_reflection,
        session,
        friday,
        request.source_hash,
        request.privacy_confirmed,
        request.regenerate,
    )


@router.post("/{friday}/approve")
def approve_week_reflection_route(
    friday: date,
    request: ReflectionSourceRequest,
    session: Session = Depends(get_db),
) -> dict:
    return _run(approve_week_reflection, session, friday, request.source_hash)


def _run(function, *args):
    try:
        return function(*args)
    except ReflectionError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error
