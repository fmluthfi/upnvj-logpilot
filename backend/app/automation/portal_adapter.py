from dataclasses import dataclass
from datetime import date
import re
import time
from typing import Callable, Literal, Mapping, Protocol
from urllib.parse import urlsplit

from .safety_guard import (
    PortalAction,
    PortalMappingNotConfiguredError,
    PortalSafetyError,
    assert_action_allowed,
    assert_safe_daily_save,
)


@dataclass(frozen=True)
class PortalMapping:
    portal_url: str = "https://kampusberdampak.upnvj.ac.id/logbook-harian"
    calendar_grid: str = "#lbhCalGrid"
    month_label: str = "#lbhMonthLabel"
    previous_month: str = "#lbhCalPrev"
    next_month: str = "#lbhCalNext"
    add_entry_button: str = "#lbhBtnAdd"
    daily_entry_context: str = "#lbhRail"
    daily_save_locator: str = "#lbhRail #lbhBtnSave"
    start_time: str = "#fMulai"
    end_time: str = "#fSelesai"
    activity: str = "#fUraianField input"
    result: str = "#fHasil"
    obstacle: str = "#fKendala"
    documentation: str = "#fDok"
    reflection: str = "#fRefleksi"
    mapping_verified: bool = False


VERIFIED_PORTAL_MAPPING = PortalMapping(mapping_verified=True)


@dataclass(frozen=True)
class PortalSaveResult:
    status: Literal["saved", "already_present", "verification_needed"]


class PortalStopRequested(PortalSafetyError):
    pass


class PortalOutcomeUncertainError(PortalSafetyError):
    pass


class PortalAdapter(Protocol):
    mapping: PortalMapping

    def save_daily_entry(
        self,
        fields: Mapping[str, str],
        *,
        should_stop: Callable[[], bool] = lambda: False,
        on_save_attempted: Callable[[], None] = lambda: None,
    ) -> PortalSaveResult: ...


class UnconfiguredPortalAdapter:
    def __init__(self, mapping: PortalMapping = PortalMapping()) -> None:
        self.mapping = mapping

    def save_daily_entry(self, fields: Mapping[str, str]) -> PortalSaveResult:
        if not self.mapping.mapping_verified:
            raise PortalMappingNotConfiguredError(
                "Mapping portal belum diverifikasi; tidak ada entri yang dikirim."
            )
        assert_action_allowed(PortalAction.SAVE_DAILY_ENTRY)
        raise AssertionError("Unreachable")


class PlaywrightPortalAdapter:
    def __init__(
        self,
        page,
        mapping: PortalMapping = VERIFIED_PORTAL_MAPPING,
        *,
        verification_timeout: float = 8,
    ) -> None:
        self.page = page
        self.mapping = mapping
        self.verification_timeout = verification_timeout

    def save_daily_entry(
        self,
        fields: Mapping[str, str],
        *,
        should_stop: Callable[[], bool] = lambda: False,
        on_save_attempted: Callable[[], None] = lambda: None,
    ) -> PortalSaveResult:
        self._validate_mapping()
        submission_date = _validate_fields(fields)
        self._assert_portal_url()
        _raise_if_stopped(should_stop)

        context = self._one(self.mapping.daily_entry_context, visible=True)
        self._select_date(submission_date, should_stop)
        context = self._one(self.mapping.daily_entry_context, visible=True)
        context_text = context.inner_text()
        activity = fields["activity_text"].strip()
        existing_count = context_text.count(activity)
        if existing_count == 1:
            return PortalSaveResult("already_present")
        if existing_count > 1:
            raise PortalSafetyError(
                "Uraian yang sama ditemukan lebih dari sekali pada tanggal tujuan; hentikan untuk diperiksa."
            )

        if self._one(self.mapping.activity, required=False) is None:
            add_button = self._one(self.mapping.add_entry_button, visible=True)
            _assert_button(add_button, "Tambah Entri")
            add_button.click()

        self._fill("start_time", fields["start_time"], expected_type="time")
        self._fill("end_time", fields["end_time"], expected_type="time")
        self._fill("activity", activity)
        self._fill("result", fields["result_text"])
        self._fill("obstacle", fields.get("obstacle_text", ""))
        self._fill("documentation", fields["documentation_url"], expected_type="url")
        if submission_date.weekday() == 4:
            self._fill("reflection", fields["reflection_text"])

        _raise_if_stopped(should_stop)
        save = self._one(self.mapping.daily_save_locator, visible=True)
        _assert_button(save, "Simpan")
        assert_safe_daily_save(
            mapping_verified=self.mapping.mapping_verified,
            allowlisted_locator=self.mapping.daily_save_locator,
            target_locator=self.mapping.daily_save_locator,
            form_is_verified=self._is_expected_date(context, submission_date),
            matching_controls=save.count(),
            control_name=save.inner_text().strip(),
        )
        on_save_attempted()
        try:
            save.click()
        except Exception as error:
            raise PortalOutcomeUncertainError(
                "Hasil klik Simpan belum dapat dipastikan. Periksa portal sebelum mencoba lagi."
            ) from error

        deadline = time.monotonic() + self.verification_timeout
        try:
            while True:
                context = self._one(self.mapping.daily_entry_context, visible=True)
                if context.inner_text().count(activity) == 1:
                    return PortalSaveResult("saved")
                if time.monotonic() >= deadline:
                    return PortalSaveResult("verification_needed")
                self.page.wait_for_timeout(250)
        except Exception as error:
            raise PortalOutcomeUncertainError(
                "Entri dikirim, tetapi hasilnya belum dapat diverifikasi. Periksa portal sebelum mencoba lagi."
            ) from error

    def _validate_mapping(self) -> None:
        if not self.mapping.mapping_verified:
            raise PortalMappingNotConfiguredError(
                "Mapping portal belum diverifikasi; tidak ada entri yang dikirim."
            )
        if self.mapping.daily_save_locator != "#lbhRail #lbhBtnSave":
            raise PortalMappingNotConfiguredError(
                "Selector Simpan tidak cocok dengan allowlist portal yang diverifikasi."
            )

    def _assert_portal_url(self) -> None:
        expected = urlsplit(self.mapping.portal_url)
        current = urlsplit(self.page.url)
        if expected.scheme != "https" or current.scheme != "https" or current.netloc != expected.netloc or current.path.rstrip("/") != expected.path.rstrip("/"):
            raise PortalSafetyError("Halaman portal tidak sesuai dengan halaman logbook yang diverifikasi.")

    def _select_date(self, target: date, should_stop: Callable[[], bool]) -> None:
        calendar = self._one(self.mapping.calendar_grid, visible=True)
        month_label = self._one(self.mapping.month_label, visible=True)
        for _ in range(120):
            _raise_if_stopped(should_stop)
            current = _parse_month(month_label.inner_text())
            target_month = target.year * 12 + target.month
            current_month = current[0] * 12 + current[1]
            if current_month == target_month:
                break
            selector = self.mapping.previous_month if target_month < current_month else self.mapping.next_month
            button = self._one(selector, visible=True)
            button.click()
            deadline = time.monotonic() + 3
            updated = current
            while updated == current and time.monotonic() < deadline:
                self.page.wait_for_timeout(200)
                updated = _parse_month(month_label.inner_text())
            expected_delta = -1 if target_month < current_month else 1
            if updated[0] * 12 + updated[1] != current_month + expected_delta:
                raise PortalSafetyError("Kalender tidak berpindah tepat satu bulan; hentikan automation.")
        else:
            raise PortalSafetyError("Tanggal berada di luar batas navigasi kalender yang aman.")

        day_button = calendar.get_by_role("button", name=str(target.day), exact=True)
        if day_button.count() != 1 or not day_button.is_visible() or not day_button.is_enabled():
            raise PortalSafetyError("Tanggal tidak dapat diidentifikasi satu kali pada kalender.")
        day_button.click()
        deadline = time.monotonic() + 3
        while True:
            context = self._one(self.mapping.daily_entry_context, visible=True)
            if self._is_expected_date(context, target):
                break
            if time.monotonic() >= deadline:
                raise PortalSafetyError("Tanggal pada panel entri tidak cocok dengan tanggal yang dipilih.")
            self.page.wait_for_timeout(200)

    def _is_expected_date(self, context, target: date) -> bool:
        weekdays = ("SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU", "MINGGU")
        months = ("JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER")
        expected = f"{weekdays[target.weekday()]}, {target.day} {months[target.month - 1]} {target.year}"
        return expected.casefold() in context.inner_text().casefold()

    def _one(self, selector: str, *, visible: bool = False, required: bool = True):
        locator = self.page.locator(selector)
        count = locator.count()
        if not required and count == 0:
            return None
        if count != 1 or (visible and not locator.is_visible()):
            raise PortalSafetyError(f"Elemen portal tidak teridentifikasi tepat satu kali: {selector}.")
        return locator

    def _fill(self, key: str, value: str, *, expected_type: str | None = None) -> None:
        locator = self._one(getattr(self.mapping, key), visible=True)
        if expected_type and locator.get_attribute("type") != expected_type:
            raise PortalSafetyError(f"Jenis field portal berubah: {getattr(self.mapping, key)}.")
        locator.fill(value)
        if locator.input_value() != value:
            raise PortalSafetyError(f"Nilai field portal tidak sesuai: {getattr(self.mapping, key)}.")


def _validate_fields(fields: Mapping[str, str]) -> date:
    required = ("date", "start_time", "end_time", "activity_text", "result_text", "documentation_url")
    allowed = {*required, "obstacle_text", "reflection_text"}
    if set(fields) - allowed:
        raise PortalSafetyError("Entri memuat field yang tidak dikenal untuk portal.")
    if any(not str(fields.get(key, "")).strip() for key in required):
        raise PortalSafetyError("Entri belum lengkap; isi tanggal, jam, uraian, hasil, dan dokumentasi.")
    try:
        target = date.fromisoformat(fields["date"])
    except (TypeError, ValueError) as error:
        raise PortalSafetyError("Tanggal entri tidak valid.") from error
    start_time = fields["start_time"]
    end_time = fields["end_time"]
    time_pattern = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    if not time_pattern.fullmatch(start_time) or not time_pattern.fullmatch(end_time) or start_time >= end_time:
        raise PortalSafetyError("Jam kerja harus memakai format 24 jam HH:MM dan selesai setelah mulai.")
    documentation = urlsplit(fields["documentation_url"])
    if documentation.scheme != "https" or not documentation.netloc:
        raise PortalSafetyError("Tautan dokumentasi harus berupa URL HTTPS yang valid.")
    reflection = fields.get("reflection_text", "") or ""
    if target.weekday() == 4 and not reflection.strip():
        raise PortalSafetyError("Refleksi yang disetujui wajib tersedia untuk entri Jumat.")
    if target.weekday() != 4 and reflection.strip():
        raise PortalSafetyError("Refleksi mingguan hanya boleh diisi pada entri Jumat.")
    return target


def _parse_month(value: str) -> tuple[int, int]:
    months = {"januari": 1, "februari": 2, "maret": 3, "april": 4, "mei": 5, "juni": 6, "juli": 7, "agustus": 8, "september": 9, "oktober": 10, "november": 11, "desember": 12}
    match = re.fullmatch(r"\s*([A-Za-z]+)\s+(\d{4})\s*", value)
    if not match or match.group(1).casefold() not in months:
        raise PortalSafetyError("Label bulan kalender berubah atau tidak dikenali.")
    return int(match.group(2)), months[match.group(1).casefold()]


def _assert_button(locator, expected_name: str) -> None:
    if locator.get_attribute("type") != "button" or locator.inner_text().strip() != expected_name or not locator.is_enabled():
        raise PortalSafetyError("Kontrol portal tidak cocok dengan tombol yang diverifikasi.")


def _raise_if_stopped(should_stop: Callable[[], bool]) -> None:
    if should_stop():
        raise PortalStopRequested("Automation dihentikan sebelum aksi simpan.")
