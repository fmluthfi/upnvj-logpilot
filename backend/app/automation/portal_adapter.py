from dataclasses import dataclass
from typing import Mapping, Protocol

from .safety_guard import (
    PortalAction,
    PortalMappingNotConfiguredError,
    assert_action_allowed,
)


@dataclass(frozen=True)
class PortalMapping:
    daily_entry_context: str | None = "#lbhRail"
    daily_save_locator: str | None = "#lbhBtnSave"
    mapping_verified: bool = False


class PortalAdapter(Protocol):
    mapping: PortalMapping

    def save_daily_entry(self, fields: Mapping[str, str]) -> None: ...


class UnconfiguredPortalAdapter:
    """Fail-closed placeholder until a user-authorized DOM inspection informs implementation."""

    def __init__(self, mapping: PortalMapping = PortalMapping()) -> None:
        self.mapping = mapping

    def save_daily_entry(self, fields: Mapping[str, str]) -> None:
        if (
            not self.mapping.mapping_verified
            or not self.mapping.daily_entry_context
            or not self.mapping.daily_save_locator
        ):
            raise PortalMappingNotConfiguredError(
                "Mapping portal belum diverifikasi; tidak ada entri yang dikirim."
            )
        assert_action_allowed(PortalAction.SAVE_DAILY_ENTRY)
