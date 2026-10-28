from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from hashlib import sha256
import json
import re
import unicodedata
from typing import Literal


@dataclass(frozen=True)
class ParsedLogbookRow:
    source_row_index: int
    date: date
    week_number: int | None
    original_activity: str | None
    result_text: str | None
    obstacle_text: str | None
    documentation_url: str | None
    kind: Literal["filled", "leave", "blank", "needs_mapping"]
    source_payload_json: str
    source_hash: str


_MONTHS = {
    "januari": 1, "jan": 1,
    "februari": 2, "feb": 2,
    "maret": 3, "mar": 3,
    "april": 4, "apr": 4,
    "mei": 5,
    "juni": 6, "jun": 6,
    "juli": 7, "jul": 7,
    "agustus": 8, "agu": 8, "agt": 8,
    "september": 9, "sep": 9,
    "oktober": 10, "okt": 10,
    "november": 11, "nov": 11,
    "desember": 12, "des": 12,
}
_DATE_HEADERS = ("tanggal", "date", "hariandtanggal", "haritanggal")
_ACTIVITY_HEADERS = (
    "uraian", "kegiatan", "aktivitas", "activity", "workdone", "taskdetails",
    "description", "deskripsi", "pekerjaan", "dikerjakan", "dailylog",
)
_RESULT_HEADERS = ("hasil", "luaran", "output", "outcome", "result")
_OBSTACLE_HEADERS = ("kendala", "hambatan", "obstacle", "challenge")
_DOCUMENTATION_HEADERS = ("dokumentasi", "documentation", "tautan", "link", "url")
_WEEK_HEADERS = ("mingguke", "week", "weeknumber")
_SIGNATURE_HEADERS = ("tandatangan", "paraf", "ttd", "signature", "initials", "signedby")


def parse_indonesian_date(value: str) -> date | None:
    normalized = _normalize(value)
    patterns = (
        (r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b", "ymd"),
        (r"\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b", "dmy"),
        (r"\b(\d{1,2})\s+([a-z]+)\s+(\d{4})\b", "month"),
    )
    for pattern, kind in patterns:
        match = re.search(pattern, normalized)
        if not match:
            continue
        try:
            if kind == "ymd":
                year, month, day = map(int, match.groups())
            elif kind == "dmy":
                day, month, year = map(int, match.groups())
            else:
                day = int(match.group(1))
                month = _MONTHS.get(match.group(2))
                year = int(match.group(3))
                if month is None:
                    continue
            return date(year, month, day)
        except ValueError:
            continue
    return None


def parse_document(document: dict) -> list[ParsedLogbookRow]:
    parsed: list[ParsedLogbookRow] = []
    row_index = 0
    for body in _document_bodies(document):
        for table in _iter_tables(body.get("content", [])):
            rows = table.get("tableRows", [])
            header_index, columns = _find_header(rows)
            signature_columns = {index for index, field in columns.items() if field == "signature"}
            previous_week: int | None = None

            for index, row in enumerate(rows):
                row_index += 1
                if index == header_index:
                    continue
                cells = [
                    _cell_data(cell) if cell_index not in signature_columns else ("", [])
                    for cell_index, cell in enumerate(row.get("tableCells", []))
                ]
                values = [cell[0] for cell in cells]
                date_index = next((i for i, field in columns.items() if field == "date"), None)
                parsed_date = _parse_row_date(values, date_index)
                if parsed_date is None:
                    continue

                week_index = next((i for i, field in columns.items() if field == "week"), None)
                week_text = values[week_index] if week_index is not None and week_index < len(values) else ""
                week_match = re.search(r"\d+", week_text)
                if week_match:
                    previous_week = int(week_match.group())

                activity_index = next((i for i, field in columns.items() if field == "activity"), None)
                result_index = next((i for i, field in columns.items() if field == "result"), None)
                obstacle_index = next((i for i, field in columns.items() if field == "obstacle"), None)
                docs_index = next((i for i, field in columns.items() if field == "documentation"), None)
                activity = _value_at(values, activity_index)
                result = _value_at(values, result_index)
                obstacle = _value_at(values, obstacle_index)
                documentation = _value_at(values, docs_index)
                if docs_index is not None and docs_index < len(cells) and not documentation:
                    links = cells[docs_index][1]
                    documentation = links[0] if links else None

                mapped_content = [value for value in (activity, result, obstacle, documentation) if value]
                has_other_content = any(
                    value and cell_index not in {date_index, week_index, activity_index, result_index, obstacle_index, docs_index}
                    for cell_index, value in enumerate(values)
                )
                if not mapped_content and not has_other_content:
                    kind: Literal["filled", "leave", "blank", "needs_mapping"] = "blank"
                elif activity is None:
                    kind = "needs_mapping"
                elif _is_leave(activity):
                    kind = "leave"
                else:
                    kind = "filled"

                payload = {
                    "date": parsed_date.isoformat(),
                    "week_number": previous_week,
                    "activity": activity,
                    "result": result,
                    "obstacle": obstacle,
                    "documentation_url": documentation,
                }
                payload_json = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
                source_hash = sha256(payload_json.encode("utf-8")).hexdigest()
                parsed.append(
                    ParsedLogbookRow(
                        source_row_index=row_index,
                        date=parsed_date,
                        week_number=previous_week,
                        original_activity=activity,
                        result_text=result,
                        obstacle_text=obstacle,
                        documentation_url=documentation,
                        kind=kind,
                        source_payload_json=payload_json,
                        source_hash=source_hash,
                    )
                )
    return parsed


def _document_bodies(document: dict):
    def walk_tabs(tabs):
        for tab in tabs:
            document_tab = tab.get("documentTab") or {}
            body = document_tab.get("body")
            if body:
                yield body
            yield from walk_tabs(tab.get("childTabs", []))

    tabs = document.get("tabs") or []
    if tabs:
        yield from walk_tabs(tabs)
    elif document.get("body"):
        yield document["body"]


def _iter_tables(elements):
    for element in elements:
        table = element.get("table")
        if not table:
            continue
        yield table
        for row in table.get("tableRows", []):
            for cell in row.get("tableCells", []):
                yield from _iter_tables(cell.get("content", []))


def _find_header(rows) -> tuple[int | None, dict[int, str]]:
    for row_index, row in enumerate(rows[:6]):
        headers = [_cell_data(cell)[0] for cell in row.get("tableCells", [])]
        columns = {
            index: field
            for index, header in enumerate(headers)
            if (field := _field_for_header(header)) is not None
        }
        if any(field == "date" for field in columns.values()) and any(field == "activity" for field in columns.values()):
            return row_index, columns
    return None, {}


def _field_for_header(value: str) -> str | None:
    header = _normalize_header(value)
    if any(term in header for term in _SIGNATURE_HEADERS):
        return "signature"
    if any(term in header for term in _DATE_HEADERS) or header == "hari":
        return "date"
    if any(term in header for term in _WEEK_HEADERS):
        return "week"
    if any(term in header for term in _OBSTACLE_HEADERS):
        return "obstacle"
    if any(term in header for term in _DOCUMENTATION_HEADERS):
        return "documentation"
    if any(term in header for term in _ACTIVITY_HEADERS):
        return "activity"
    if any(term in header for term in _RESULT_HEADERS):
        return "result"
    return None


def _parse_row_date(values: list[str], date_index: int | None) -> date | None:
    if date_index is not None and date_index < len(values):
        parsed = parse_indonesian_date(values[date_index])
        if parsed:
            return parsed
    matches = [parsed for value in values if (parsed := parse_indonesian_date(value)) is not None]
    return matches[0] if len(set(matches)) == 1 else None


def _cell_data(cell: dict) -> tuple[str, list[str]]:
    text: list[str] = []
    links: list[str] = []

    def walk(elements):
        for element in elements:
            paragraph = element.get("paragraph")
            if paragraph:
                for item in paragraph.get("elements", []):
                    text_run = item.get("textRun") or {}
                    if text_run.get("content"):
                        text.append(text_run["content"])
                    url = (text_run.get("textStyle") or {}).get("link", {}).get("url")
                    if url and url not in links:
                        links.append(url)
            nested_table = element.get("table")
            if nested_table:
                for row in nested_table.get("tableRows", []):
                    for nested_cell in row.get("tableCells", []):
                        walk(nested_cell.get("content", []))

    walk(cell.get("content", []))
    return _normalize_text("".join(text)), links


def _value_at(values: list[str], index: int | None) -> str | None:
    if index is None or index >= len(values):
        return None
    return values[index] or None


def _is_leave(value: str) -> bool:
    text = _normalize(value)
    return bool(re.search(r"\b(?:izin|cuti|sakit|leave|sick)\b", text))


def _normalize_text(value: str) -> str:
    lines = [re.sub(r"[ \t\f\v]+", " ", line).strip() for line in value.replace("\r", "").split("\n")]
    return "\n".join(line for line in lines if line)


def _normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value.casefold())
    without_marks = "".join(char for char in decomposed if not unicodedata.combining(char))
    return re.sub(r"\s+", " ", without_marks).strip()


def _normalize_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", _normalize(value))
