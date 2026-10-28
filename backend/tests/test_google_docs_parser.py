import unittest
from datetime import date

from app.services.google_docs_parser import parse_document, parse_indonesian_date
from app.services.logbook_coverage import build_coverage


def cell(value: str) -> dict:
    return {
        "content": [
            {
                "paragraph": {
                    "elements": [{"textRun": {"content": value + "\n"}}]
                }
            }
        ]
    }


def document(rows: list[list[str]]) -> dict:
    table = {"tableRows": [{"tableCells": [cell(value) for value in row]} for row in rows]}
    return {"body": {"content": [{"table": table}]}}


class GoogleDocsParserTests(unittest.TestCase):
    def test_parses_reordered_columns_multiline_text_and_inherited_week(self) -> None:
        parsed = parse_document(
            document(
                [
                    ["Minggu Ke", "Aktivitas Harian", "Hari dan Tanggal", "Tanda Tangan", "Hasil"],
                    ["1", "Riset kebutuhan\nMenyusun catatan", "Kamis, 15 Oktober 2026", "TANDA-TANGAN-RAHASIA", "Draft alur"],
                    ["", "", "Jumat, 16 Oktober 2026", "", ""],
                    ["", "Izin Sakit", "Senin, 19 Oktober 2026", "", ""],
                ]
            )
        )

        self.assertEqual([row.date for row in parsed], [date(2026, 10, 15), date(2026, 10, 16), date(2026, 10, 19)])
        self.assertEqual(parsed[0].original_activity, "Riset kebutuhan\nMenyusun catatan")
        self.assertEqual(parsed[0].result_text, "Draft alur")
        self.assertEqual(parsed[1].week_number, 1)
        self.assertEqual([row.kind for row in parsed], ["filled", "blank", "leave"])
        self.assertNotIn("TANDA-TANGAN-RAHASIA", parsed[0].source_payload_json)

    def test_parses_a_different_template_and_date_format(self) -> None:
        parsed = parse_document(
            document([["Date", "Work Done", "Week"], ["2026-10-20", "Diskusi desain", "4"]])
        )

        self.assertEqual(parsed[0].date, date(2026, 10, 20))
        self.assertEqual(parsed[0].original_activity, "Diskusi desain")
        self.assertEqual(parsed[0].week_number, 4)

    def test_unrecognized_activity_header_requires_mapping_without_copying_unknown_text(self) -> None:
        parsed = parse_document(
            document([["Tanggal", "Catatan bebas"], ["21/10/2026", "Menyusun laporan"]])
        )

        self.assertEqual(parsed[0].kind, "needs_mapping")
        self.assertIsNone(parsed[0].original_activity)

    def test_indonesian_month_and_numeric_dates(self) -> None:
        self.assertEqual(parse_indonesian_date("Jum'at, 23 Okt 2026"), date(2026, 10, 23))
        self.assertEqual(parse_indonesian_date("21/09/2026"), date(2026, 9, 21))
        self.assertIsNone(parse_indonesian_date("tanggal belum ditentukan"))

    def test_coverage_marks_filled_blank_leave_and_missing_within_selected_range(self) -> None:
        parsed = parse_document(
            document(
                [
                    ["Tanggal", "Uraian Kegiatan"],
                    ["19 Oktober 2026", "Izin Sakit"],
                    ["20 Oktober 2026", ""],
                    ["21 Oktober 2026", "Review dokumen"],
                ]
            )
        )

        report = build_coverage(date(2026, 10, 19), date(2026, 10, 22), parsed)

        self.assertEqual([day.status for day in report.days], ["leave", "blank", "filled", "missing"])
        self.assertEqual(report.summary, {"filled": 1, "leave": 1, "blank": 1, "needs_mapping": 0, "missing": 1})


if __name__ == "__main__":
    unittest.main()
