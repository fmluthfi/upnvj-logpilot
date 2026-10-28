import sys
from datetime import datetime, timezone
from pathlib import Path
from time import monotonic

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.automation.portal_adapter import (
    PortalOutcomeUncertainError,
    PortalSafetyError,
    PortalStopRequested,
    PlaywrightPortalAdapter,
    VERIFIED_PORTAL_MAPPING,
)
from app.db.models import AutomationRun, AutomationRunEntry, LogbookEntry
from app.db.session import get_engine
from app.services.reflection_service import get_week_reflection


def execute_queued_entries(session: Session, run_id: str, adapter, should_stop) -> None:
    run = session.get(AutomationRun, run_id)
    if not run:
        return
    run.status = "running"
    session.commit()

    items = list(session.scalars(
        select(AutomationRunEntry)
        .where(AutomationRunEntry.run_id == run_id, AutomationRunEntry.status == "queued")
        .order_by(AutomationRunEntry.created_at, AutomationRunEntry.id)
    ))

    for item in items:
        session.refresh(run)
        if run.stop_requested:
            run.status = "stopped"
            _stop_remaining(session, run, items[items.index(item):])
            return

        entry = session.get(LogbookEntry, item.entry_id)
        if not entry or not entry.entry_approved or entry.source_conflict or entry.status not in {"approved", "processing"}:
            _fail_entry(session, run, item, entry, "Persetujuan atau catatan sumber berubah sebelum diproses.")
            _stop_remaining(session, run, items[items.index(item) + 1:])
            return

        item.status = "processing"
        entry.status = "processing"
        entry.last_error = None
        session.commit()

        try:
            fields = _portal_fields(session, entry)
            result = adapter.save_daily_entry(
                fields,
                should_stop=should_stop,
                on_save_attempted=lambda: _mark_save_attempted(session, item),
            )
        except PortalStopRequested:
            session.refresh(item)
            if item.save_attempted:
                _require_manual_check(session, run, item, entry)
            else:
                entry.status = "approved"
                item.status = "stopped"
                item.safe_to_retry = True
                session.commit()
                session.refresh(run)
                run.status = "stopped"
                _stop_remaining(session, run, items[items.index(item) + 1:])
            return
        except PortalOutcomeUncertainError:
            _require_manual_check(session, run, item, entry)
            _stop_remaining(session, run, items[items.index(item) + 1:])
            return
        except Exception as error:
            session.refresh(item)
            if item.save_attempted:
                _require_manual_check(session, run, item, entry)
            else:
                message = str(error) if isinstance(error, PortalSafetyError) else "Langkah portal gagal sebelum Simpan. Periksa sesi dan mapping, lalu coba ulang."
                _fail_entry(session, run, item, entry, message)
            _stop_remaining(session, run, items[items.index(item) + 1:])
            return

        session.refresh(item)
        session.refresh(run)
        if result.status == "verification_needed":
            _require_manual_check(session, run, item, entry)
            _stop_remaining(session, run, items[items.index(item) + 1:])
            return

        item.status = "submitted"
        entry.status = "submitted"
        entry.last_submitted_at = datetime.now(timezone.utc)
        entry.last_error = None
        run.completed_entries += 1
        session.commit()

        session.refresh(run)
        if run.stop_requested:
            run.status = "stopped"
            session.commit()
            _stop_remaining(session, run, items[items.index(item) + 1:])
            return

    session.refresh(run)
    if not run.stop_requested:
        run.status = "completed"
    else:
        run.status = "stopped"
    session.commit()


def _portal_fields(session: Session, entry: LogbookEntry) -> dict[str, str]:
    reflection_text = ""
    if entry.date.weekday() == 4:
        reflection = get_week_reflection(session, entry.date)
        if not reflection["approved"] or not reflection["reflection_text"].strip():
            raise PortalSafetyError("Refleksi Jumat belum disetujui atau berubah sejak persetujuan.")
        reflection_text = reflection["reflection_text"]

    if not all(((entry.activity_text or "").strip(), (entry.result_text or "").strip(), entry.start_time, entry.end_time, (entry.documentation_url or "").strip())):
        raise PortalSafetyError("Entri belum lengkap untuk disimpan di portal.")

    return {
        "date": entry.date.isoformat(),
        "start_time": entry.start_time.strftime("%H:%M"),
        "end_time": entry.end_time.strftime("%H:%M"),
        "activity_text": entry.activity_text.strip(),
        "result_text": entry.result_text.strip(),
        "obstacle_text": (entry.obstacle_text or "").strip(),
        "documentation_url": entry.documentation_url.strip(),
        "reflection_text": reflection_text,
    }


def _mark_save_attempted(session: Session, item: AutomationRunEntry) -> None:
    item.save_attempted = True
    session.commit()


def _require_manual_check(session: Session, run: AutomationRun, item: AutomationRunEntry, entry: LogbookEntry) -> None:
    item.status = "verification_needed"
    item.last_error = "Hasil Simpan belum dapat dipastikan. Periksa entri pada portal sebelum mengulang."
    entry.status = "verification_needed"
    entry.last_error = item.last_error
    run.status = "paused"
    run.last_error = item.last_error
    session.commit()


def _fail_entry(session: Session, run: AutomationRun, item: AutomationRunEntry, entry: LogbookEntry | None, message: str) -> None:
    item.status = "failed"
    item.safe_to_retry = not item.save_attempted
    item.last_error = message
    if entry:
        entry.status = "failed"
        entry.last_error = message
    run.status = "failed"
    run.last_error = message
    session.commit()


def _stop_remaining(session: Session, run: AutomationRun, items: list[AutomationRunEntry]) -> None:
    for item in items:
        if item.status != "queued":
            continue
        item.safe_to_retry = not item.save_attempted
        entry = session.get(LogbookEntry, item.entry_id)
        if entry and entry.status == "processing":
            entry.status = "approved"
        item.status = "stopped"
    session.commit()
    session.refresh(run)


def _run_browser(run_id: str) -> None:
    session = Session(get_engine())
    run = session.get(AutomationRun, run_id)
    if not run:
        session.close()
        return
    if run.stop_requested:
        run.status = "stopped"
        session.commit()
        _stop_remaining(session, run, list(session.scalars(
            select(AutomationRunEntry).where(
                AutomationRunEntry.run_id == run_id,
                AutomationRunEntry.status == "queued",
            )
        )))
        session.close()
        return
    run.status = "waiting_login"
    run.last_error = None
    session.commit()
    profile_dir = Path(__file__).resolve().parents[2] / ".browser-profile"

    try:
        profile_dir.mkdir(parents=True, exist_ok=True)
        from playwright.sync_api import sync_playwright

        with sync_playwright() as playwright:
            context = playwright.chromium.launch_persistent_context(str(profile_dir), headless=False)
            try:
                page = context.pages[0] if context.pages else context.new_page()
                page.set_default_timeout(5000)
                page.goto(VERIFIED_PORTAL_MAPPING.portal_url, wait_until="domcontentloaded", timeout=30000)
                deadline = monotonic() + 600
                while monotonic() < deadline:
                    session.refresh(run)
                    if run.stop_requested:
                        run.status = "stopped"
                        _stop_remaining(session, run, list(session.scalars(
                            select(AutomationRunEntry).where(
                                AutomationRunEntry.run_id == run_id,
                                AutomationRunEntry.status == "queued",
                            )
                        )))
                        return
                    calendar = page.locator(VERIFIED_PORTAL_MAPPING.month_label)
                    if calendar.count() == 1 and calendar.is_visible():
                        break
                    page.wait_for_timeout(1000)
                else:
                    run.status = "failed"
                    run.last_error = "Login manual belum selesai. Jalankan ulang setelah masuk ke portal."
                    session.commit()
                    _stop_remaining(session, run, list(session.scalars(
                        select(AutomationRunEntry).where(
                            AutomationRunEntry.run_id == run_id,
                            AutomationRunEntry.status == "queued",
                        )
                    )))
                    return

                execute_queued_entries(
                    session,
                    run_id,
                    PlaywrightPortalAdapter(page, VERIFIED_PORTAL_MAPPING),
                    should_stop=lambda: _stop_requested(session, run),
                )
            finally:
                context.close()
    except Exception:
        session.refresh(run)
        if run.status in {"waiting_login", "running", "queued", "stopping"}:
            run.status = "failed"
            run.last_error = "Browser automation tidak dapat dijalankan. Periksa instalasi Playwright dan sesi portal."
            session.commit()
            queued = list(session.scalars(
                select(AutomationRunEntry).where(
                    AutomationRunEntry.run_id == run_id,
                    AutomationRunEntry.status == "queued",
                )
            ))
            _stop_remaining(session, run, queued)
    finally:
        session.close()


def _stop_requested(session: Session, run: AutomationRun) -> bool:
    session.refresh(run)
    return run.stop_requested


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("run id is required")
    _run_browser(sys.argv[1])


if __name__ == "__main__":
    main()
