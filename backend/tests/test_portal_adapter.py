import unittest
from datetime import date

from app.automation.portal_adapter import (
    PortalMapping,
    PortalMappingNotConfiguredError,
    PortalSafetyError,
    PortalStopRequested,
    PlaywrightPortalAdapter,
)


ACTIVITY = "Membuat halaman fasilitas dengan WordPress."


class FakeLocator:
    def __init__(self, page, selector):
        self.page = page
        self.selector = selector

    def count(self):
        return self.page.count_overrides.get(self.selector, self.page.count_for(self.selector))

    def is_visible(self):
        return self.page.visible(self.selector)

    def is_enabled(self):
        return True

    def inner_text(self):
        if self.selector == "#lbhMonthLabel":
            return self.page.month_label
        if self.selector in {"#lbhRail", "#lbhRail #lbhBtnSave"}:
            return self.page.context_text if self.selector == "#lbhRail" else "Simpan"
        return self.page.button_text.get(self.selector, "")

    def get_attribute(self, name):
        if name != "type":
            return None
        if self.selector in {"#lbhRail #lbhBtnSave", "#lbhBtnAdd"}:
            return "button"
        return {"#fMulai": "time", "#fSelesai": "time", "#fDok": "url"}.get(self.selector, "text")

    def input_value(self):
        return self.page.fields.get(self.selector, "")

    def fill(self, value):
        self.page.fields[self.selector] = value

    def click(self):
        self.page.clicks[self.selector] = self.page.clicks.get(self.selector, 0) + 1
        if self.selector == "#lbhCalPrev":
            self.page.month_label = "September 2026"
        elif self.selector == "#lbhCalNext":
            self.page.month_label = "Oktober 2026" if self.page.month_label == "September 2026" else "November 2026"
        elif self.selector.startswith("calendar-day:"):
            month, year = self.page.month_label.split()
            month_number = {"September": 9, "Oktober": 10, "November": 11}[month]
            selected = date(int(year), month_number, int(self.selector.split(":")[1]))
            weekday = ("SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU", "MINGGU")[selected.weekday()]
            self.page.context_text = f"{weekday}, {selected.day} {month.upper()} {year}"
            self.page.form_visible = False
            if self.page.existing_activity:
                self.page.context_text += "\n" + self.page.existing_activity
        elif self.selector == "#lbhBtnAdd":
            self.page.form_visible = True
        elif self.selector == "#lbhRail #lbhBtnSave":
            if not self.page.suppress_verification:
                self.page.context_text += "\n" + self.page.fields["#fUraianField input"]


class FakeCalendar(FakeLocator):
    def get_by_role(self, role, *, name, exact):
        assert role == "button" and exact is True
        return FakeLocator(self.page, f"calendar-day:{name}")


class FakePage:
    url = "https://kampusberdampak.upnvj.ac.id/logbook-harian"

    def __init__(self):
        self.month_label = "Oktober 2026"
        self.context_text = ""
        self.form_visible = False
        self.existing_activity = ""
        self.suppress_verification = False
        self.fields = {}
        self.clicks = {}
        self.count_overrides = {}
        self.button_text = {"#lbhBtnAdd": "Tambah Entri"}

    def locator(self, selector):
        return FakeCalendar(self, selector) if selector == "#lbhCalGrid" else FakeLocator(self, selector)

    def count_for(self, selector):
        if selector.startswith("calendar-day:"):
            return 1 if selector == "calendar-day:1" else 0
        if selector.startswith("#f"):
            return 1 if self.form_visible else 0
        return 1

    def visible(self, selector):
        return not selector.startswith("#f") or self.form_visible

    def wait_for_timeout(self, _milliseconds):
        return None


def entry_fields(**overrides):
    return {
        "date": "2026-10-01",
        "start_time": "09:00",
        "end_time": "17:00",
        "activity_text": ACTIVITY,
        "result_text": "Halaman fasilitas ditambahkan.",
        "obstacle_text": "",
        "documentation_url": "https://drive.google.com/file/d/example/view",
        "reflection_text": "",
        **overrides,
    }


class PortalAdapterTests(unittest.TestCase):
    def setUp(self):
        self.page = FakePage()
        self.mapping = PortalMapping(mapping_verified=True)
        self.adapter = PlaywrightPortalAdapter(self.page, self.mapping, verification_timeout=0)

    def test_saves_only_through_exact_daily_save_and_never_finalizes(self):
        result = self.adapter.save_daily_entry(entry_fields())

        self.assertEqual(result.status, "saved")
        self.assertEqual(self.page.clicks.get("#lbhRail #lbhBtnSave"), 1)
        self.assertEqual(self.page.clicks.get("#lbhBtnFinish", 0), 0)
        self.assertEqual(self.page.fields["#fHasil"], "Halaman fasilitas ditambahkan.")

    def test_duplicate_activity_is_not_submitted_again(self):
        self.page.existing_activity = ACTIVITY

        result = self.adapter.save_daily_entry(entry_fields())

        self.assertEqual(result.status, "already_present")
        self.assertEqual(self.page.clicks.get("#lbhRail #lbhBtnSave", 0), 0)
        self.assertEqual(self.page.clicks.get("#lbhBtnAdd", 0), 0)

    def test_ambiguous_save_control_stops_before_any_save(self):
        self.page.count_overrides["#lbhRail #lbhBtnSave"] = 2

        with self.assertRaises(PortalSafetyError):
            self.adapter.save_daily_entry(entry_fields())

        self.assertEqual(self.page.clicks.get("#lbhRail #lbhBtnSave", 0), 0)
        self.assertEqual(self.page.clicks.get("#lbhBtnFinish", 0), 0)

    def test_unverified_mapping_stops_before_page_interaction(self):
        adapter = PlaywrightPortalAdapter(self.page, PortalMapping(), verification_timeout=0)

        with self.assertRaises(PortalMappingNotConfiguredError):
            adapter.save_daily_entry(entry_fields())

        self.assertEqual(self.page.clicks, {})

    def test_stop_requested_before_save_does_not_click_any_save_control(self):
        with self.assertRaises(PortalStopRequested):
            self.adapter.save_daily_entry(entry_fields(), should_stop=lambda: True)

        self.assertEqual(self.page.clicks.get("#lbhRail #lbhBtnSave", 0), 0)
        self.assertEqual(self.page.clicks.get("#lbhBtnFinish", 0), 0)

    def test_calendar_moves_by_the_verified_month_control(self):
        self.page.month_label = "September 2026"

        result = self.adapter.save_daily_entry(entry_fields())

        self.assertEqual(result.status, "saved")
        self.assertEqual(self.page.clicks.get("#lbhCalNext"), 1)

    def test_wrong_portal_and_friday_without_approved_reflection_stop_before_clicks(self):
        self.page.url = "https://example.com/logbook-harian"
        with self.assertRaises(PortalSafetyError):
            self.adapter.save_daily_entry(entry_fields())
        self.assertEqual(self.page.clicks, {})

        self.page.url = FakePage.url
        with self.assertRaises(PortalSafetyError):
            self.adapter.save_daily_entry(entry_fields(date="2026-10-02", reflection_text=""))
        self.assertEqual(self.page.clicks, {})

    def test_unverified_save_result_is_marked_ambiguous_after_one_click(self):
        self.page.suppress_verification = True

        result = self.adapter.save_daily_entry(entry_fields())

        self.assertEqual(result.status, "verification_needed")
        self.assertEqual(self.page.clicks.get("#lbhRail #lbhBtnSave"), 1)


if __name__ == "__main__":
    unittest.main()
