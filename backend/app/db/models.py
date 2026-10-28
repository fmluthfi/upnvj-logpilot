from datetime import date as PyDate, datetime, time as PyTime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, Date, DateTime, Integer, String, Text, Time, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LogbookEntry(Base):
    __tablename__ = "logbook_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    source_document_id: Mapped[str | None] = mapped_column(String(256))
    source_row_index: Mapped[int | None] = mapped_column(Integer)
    source_hash: Mapped[str | None] = mapped_column(String(64))
    source_payload_json: Mapped[str | None] = mapped_column(Text)
    source_conflict: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    week_number: Mapped[int | None] = mapped_column(Integer)
    date: Mapped[PyDate] = mapped_column(Date, index=True, nullable=False)
    original_activity: Mapped[str | None] = mapped_column(Text)
    activity_text: Mapped[str | None] = mapped_column(Text)
    result_text: Mapped[str | None] = mapped_column(Text)
    obstacle_text: Mapped[str | None] = mapped_column(Text)
    start_time: Mapped[PyTime | None] = mapped_column(Time)
    end_time: Mapped[PyTime | None] = mapped_column(Time)
    documentation_url: Mapped[str | None] = mapped_column(Text)
    reflection_text: Mapped[str | None] = mapped_column(Text)
    reflection_approved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    entry_approved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True, nullable=False)
    portal_entry_id: Mapped[str | None] = mapped_column(String(256))
    last_submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.current_timestamp(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=func.current_timestamp(),
        nullable=False,
    )


class LogbookSettings(Base):
    __tablename__ = "logbook_settings"

    id: Mapped[str] = mapped_column(String(16), primary_key=True, default="local")
    default_start_time: Mapped[PyTime | None] = mapped_column(Time)
    default_end_time: Mapped[PyTime | None] = mapped_column(Time)
