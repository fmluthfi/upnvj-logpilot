from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable

from app.services.google_docs_parser import ParsedLogbookRow


@dataclass(frozen=True)
class CoverageDay:
    date: str
    status: str
    row_count: int
    entries: list[dict]


@dataclass(frozen=True)
class CoverageReport:
    days: list[CoverageDay]
    summary: dict[str, int]


def build_coverage(
    start_date: date,
    end_date: date,
    rows: Iterable[ParsedLogbookRow],
    source_conflict_rows: set[int] | None = None,
) -> CoverageReport:
    if start_date > end_date:
        raise ValueError("Tanggal mulai harus sama dengan atau sebelum tanggal akhir.")

    grouped: dict[date, list[ParsedLogbookRow]] = {}
    for row in rows:
        if start_date <= row.date <= end_date:
            grouped.setdefault(row.date, []).append(row)

    conflicts = source_conflict_rows or set()
    days: list[CoverageDay] = []
    summary = {"filled": 0, "leave": 0, "blank": 0, "needs_mapping": 0, "missing": 0}
    current = start_date
    while current <= end_date:
        entries = grouped.get(current, [])
        statuses = {entry.kind for entry in entries}
        if "filled" in statuses:
            status = "filled"
        elif "leave" in statuses:
            status = "leave"
        elif "needs_mapping" in statuses:
            status = "needs_mapping"
        elif "blank" in statuses:
            status = "blank"
        else:
            status = "missing"
        summary[status] += 1
        days.append(
            CoverageDay(
                date=current.isoformat(),
                status=status,
                row_count=len(entries),
                entries=[
                    {
                        "source_row_index": entry.source_row_index,
                        "week_number": entry.week_number,
                        "activity": entry.original_activity,
                        "result": entry.result_text,
                        "obstacle": entry.obstacle_text,
                        "documentation_url": entry.documentation_url,
                        "kind": entry.kind,
                        "source_conflict": entry.source_row_index in conflicts,
                    }
                    for entry in entries
                ],
            )
        )
        current += timedelta(days=1)
    return CoverageReport(days=days, summary=summary)
