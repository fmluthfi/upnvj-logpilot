import unittest

from app.automation.safety_guard import (
    PortalMappingNotConfiguredError,
    PortalAction,
    PortalSafetyError,
    assert_action_allowed,
    assert_safe_daily_save,
)
from app.automation.portal_adapter import PortalMapping, UnconfiguredPortalAdapter


class SafetyGuardTests(unittest.TestCase):
    def test_logbook_finalization_is_always_rejected(self):
        with self.assertRaises(PortalSafetyError):
            assert_action_allowed(PortalAction.FINALIZE_LOGBOOK)

    def test_daily_save_is_rejected_until_a_mapping_is_verified(self):
        with self.assertRaises(PortalSafetyError):
            assert_safe_daily_save(
                mapping_verified=False,
                allowlisted_locator=None,
                target_locator=None,
                form_is_verified=False,
                matching_controls=0,
                control_name=None,
            )

    def test_target_locator_must_match_allowlist(self):
        with self.assertRaises(PortalSafetyError):
            assert_safe_daily_save(
                mapping_verified=True,
                allowlisted_locator="test-only-control",
                target_locator="other-test-only-control",
                form_is_verified=True,
                matching_controls=1,
                control_name="Simpan",
            )

    def test_save_requires_exactly_one_control(self):
        with self.assertRaises(PortalSafetyError):
            assert_safe_daily_save(
                mapping_verified=True,
                allowlisted_locator="test-only-control",
                target_locator="test-only-control",
                form_is_verified=True,
                matching_controls=2,
                control_name="Simpan",
            )

    def test_save_requires_exact_daily_save_name(self):
        with self.assertRaises(PortalSafetyError):
            assert_safe_daily_save(
                mapping_verified=True,
                allowlisted_locator="test-only-control",
                target_locator="test-only-control",
                form_is_verified=True,
                matching_controls=1,
                control_name="Batal",
            )

    def test_safe_preflight_accepts_only_verified_unique_save_target(self):
        assert_safe_daily_save(
            mapping_verified=True,
            allowlisted_locator="test-only-control",
            target_locator="test-only-control",
            form_is_verified=True,
            matching_controls=1,
            control_name="Simpan",
        )

    def test_finalization_control_cannot_be_used_as_a_daily_save(self):
        with self.assertRaises(PortalSafetyError):
            assert_safe_daily_save(
                mapping_verified=True,
                allowlisted_locator="test-only-control",
                target_locator="test-only-control",
                form_is_verified=True,
                matching_controls=1,
                control_name="  SELESAIKAN\nLOGBOOK MAGANG ",
            )

    def test_unconfigured_adapter_never_submits(self):
        with self.assertRaises(PortalMappingNotConfiguredError):
            UnconfiguredPortalAdapter().save_daily_entry({})

    def test_adapter_still_blocks_submission_when_mapping_is_marked_verified(self):
        adapter = UnconfiguredPortalAdapter(
            PortalMapping(
                daily_entry_context="#lbhRail",
                daily_save_locator="#lbhBtnSave",
                mapping_verified=True,
            )
        )
        with self.assertRaises(PortalSafetyError):
            adapter.save_daily_entry({})


if __name__ == "__main__":
    unittest.main()
