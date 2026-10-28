from enum import StrEnum
import re
import unicodedata


class PortalAction(StrEnum):
    NAVIGATE = "navigate"
    SELECT_DATE = "select_date"
    FILL_FIELD = "fill_field"
    SAVE_DAILY_ENTRY = "save_daily_entry"
    FINALIZE_LOGBOOK = "finalize_logbook"


class PortalSafetyError(RuntimeError):
    pass


class PortalMappingNotConfiguredError(PortalSafetyError):
    pass


_NON_FINALIZING_ACTIONS = {
    PortalAction.NAVIGATE,
    PortalAction.SELECT_DATE,
    PortalAction.FILL_FIELD,
}
_FINALIZATION_WORDS = (
    "selesaikan",
    "selesai",
    "finalisasi",
    "finalize",
    "finalise",
    "complete",
)
_DAILY_SAVE_NAME = "simpan"


def assert_action_allowed(action: PortalAction) -> None:
    if action is PortalAction.FINALIZE_LOGBOOK:
        raise PortalSafetyError("Finalisasi logbook dilarang.")
    if action is PortalAction.SAVE_DAILY_ENTRY:
        raise PortalSafetyError("Aksi simpan belum diaktifkan di versi ini.")
    if action not in _NON_FINALIZING_ACTIONS:
        raise PortalSafetyError("Aksi portal tidak dikenal atau tidak diizinkan.")


def assert_safe_daily_save(
    *,
    mapping_verified: bool,
    allowlisted_locator: str | None,
    target_locator: str | None,
    form_is_verified: bool,
    matching_controls: int,
    control_name: str | None,
) -> None:
    if not mapping_verified or not allowlisted_locator or target_locator != allowlisted_locator:
        raise PortalSafetyError("Kontrol Simpan tidak cocok dengan mapping yang diverifikasi.")
    if not form_is_verified:
        raise PortalSafetyError("Konteks formulir entri harian belum diverifikasi.")
    if matching_controls != 1:
        raise PortalSafetyError("Kontrol Simpan harus teridentifikasi tepat satu kali.")
    normalized_name = _normalize(control_name or "")
    if not normalized_name or any(word in normalized_name for word in _FINALIZATION_WORDS):
        raise PortalSafetyError("Nama kontrol kosong atau menyerupai aksi finalisasi.")
    if normalized_name != _DAILY_SAVE_NAME:
        raise PortalSafetyError("Target bukan kontrol Simpan harian yang terverifikasi.")


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value).casefold()).strip()
