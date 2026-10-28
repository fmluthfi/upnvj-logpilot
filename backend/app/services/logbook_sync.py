from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import LogbookEntry, LogbookSettings
from app.services.google_docs_parser import ParsedLogbookRow


@dataclass(frozen=True)
class SyncCounts:
    created: int
    updated: int
    unchanged: int
    conflicts: frozenset[int]
    conflict_count: int


def persist_source_rows(
    session: Session,
    document_id: str,
    rows: list[ParsedLogbookRow],
    start_date: date | None = None,
    end_date: date | None = None,
) -> SyncCounts:
    if (start_date is None) != (end_date is None):
        raise ValueError("Both range dates must be provided together.")
    if start_date is not None and end_date is not None:
        rows = [row for row in rows if start_date <= row.date <= end_date]

    created = updated = unchanged = 0
    conflicts: set[int] = set()
    statuses = {"filled": "draft", "leave": "skipped", "needs_mapping": "needs_review"}
    settings = session.get(LogbookSettings, "local")
    default_documentation_url = settings.default_documentation_url if settings else None

    statement = select(LogbookEntry).where(LogbookEntry.source_document_id == document_id)
    if start_date is not None and end_date is not None:
        statement = statement.where(LogbookEntry.date.between(start_date, end_date))
    existing_entries = list(session.scalars(statement))
    unmatched = {entry.id: entry for entry in existing_entries}

    for row in rows:
        if row.kind == "blank":
            continue

        same_hash = [entry for entry in unmatched.values() if entry.source_hash == row.source_hash]
        same_date = [entry for entry in unmatched.values() if entry.date == row.date]
        existing = next(iter(same_hash), None)
        if existing is None:
            existing = next(
                (
                    entry
                    for entry in same_date
                    if entry.source_row_index == row.source_row_index
                ),
                None,
            )
        if existing is None and len(same_date) == 1:
            existing = same_date[0]

        if existing is None:
            session.add(
                LogbookEntry(
                    source_document_id=document_id,
                    source_row_index=row.source_row_index,
                    source_hash=row.source_hash,
                    source_payload_json=row.source_payload_json,
                    source_conflict=False,
                    week_number=row.week_number,
                    date=row.date,
                    original_activity=row.original_activity,
                    result_text=row.result_text,
                    obstacle_text=row.obstacle_text,
                    documentation_url=(
                        row.documentation_url or default_documentation_url
                        if row.kind == "filled"
                        else row.documentation_url
                    ),
                    status=statuses[row.kind],
                    last_error=_row_note(row.kind),
                )
            )
            created += 1
            continue

        unmatched.pop(existing.id)
        existing.source_row_index = row.source_row_index

        if existing.source_hash == row.source_hash:
            unchanged += 1
            if existing.source_conflict:
                conflicts.add(row.source_row_index)
            continue

        existing.date = row.date
        existing.week_number = row.week_number
        existing.original_activity = row.original_activity
        existing.result_text = row.result_text
        existing.obstacle_text = row.obstacle_text
        existing.documentation_url = (
            row.documentation_url or existing.documentation_url or default_documentation_url
            if row.kind == "filled"
            else row.documentation_url
        )
        existing.source_payload_json = row.source_payload_json
        existing.source_hash = row.source_hash
        existing.source_conflict = True
        existing.entry_approved = False
        existing.reflection_approved = False
        existing.status = "needs_review"
        existing.last_error = "Sumber berubah sejak sinkronisasi terakhir; periksa sebelum digunakan."
        conflicts.add(row.source_row_index)
        updated += 1

    for existing in unmatched.values():
        if existing.source_conflict:
            continue
        existing.source_conflict = True
        existing.entry_approved = False
        existing.reflection_approved = False
        existing.status = "needs_review"
        existing.last_error = "Catatan tidak ditemukan lagi pada sumber; periksa sebelum digunakan."

    conflict_count = sum(entry.source_conflict for entry in existing_entries)
    session.commit()
    return SyncCounts(created, updated, unchanged, frozenset(conflicts), conflict_count)


def _row_note(kind: str) -> str | None:
    if kind == "leave":
        return "Ditandai izin/sakit dan tidak dihitung sebagai entri kerja biasa."
    if kind == "needs_mapping":
        return "Kolom aktivitas belum dikenali; perlu pemetaan sebelum digunakan."
    return None
