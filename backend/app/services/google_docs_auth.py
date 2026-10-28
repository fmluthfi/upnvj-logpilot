from __future__ import annotations

from pathlib import Path
from threading import Lock, Thread

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

from app.core.config import get_settings


SCOPES = ["https://www.googleapis.com/auth/documents.readonly"]
_state_lock = Lock()
_flow_state = "disconnected"


class GoogleDocsAuthorizationRequired(RuntimeError):
    pass


class GoogleOAuthNotConfigured(RuntimeError):
    pass


class GoogleOAuthAlreadyRunning(RuntimeError):
    pass


def get_google_credentials() -> Credentials:
    token_file = get_settings().google_oauth_token_file
    credentials = _load_credentials(token_file)
    if not credentials or not credentials.has_scopes(SCOPES):
        raise GoogleDocsAuthorizationRequired

    if credentials.expired and credentials.refresh_token:
        try:
            credentials.refresh(Request())
        except Exception as error:
            raise GoogleDocsAuthorizationRequired from error
        _save_credentials(token_file, credentials)

    if not credentials.valid:
        raise GoogleDocsAuthorizationRequired
    return credentials


def get_connection_status() -> dict[str, str | bool]:
    settings = get_settings()
    credentials = _load_credentials(settings.google_oauth_token_file)
    connected = bool(
        credentials
        and credentials.has_scopes(SCOPES)
        and (credentials.valid or credentials.refresh_token)
    )
    with _state_lock:
        state = "connected" if connected else _flow_state
    return {
        "configured": settings.google_oauth_client_file.is_file(),
        "connected": connected,
        "state": state,
    }


def start_oauth_flow() -> str:
    global _flow_state
    settings = get_settings()
    if not settings.google_oauth_client_file.is_file():
        raise GoogleOAuthNotConfigured
    if get_connection_status()["connected"]:
        return "connected"

    with _state_lock:
        if _flow_state == "connecting":
            raise GoogleOAuthAlreadyRunning
        _flow_state = "connecting"
    Thread(target=_authorize, name="google-docs-oauth", daemon=True).start()
    return "connecting"


def _authorize() -> None:
    global _flow_state
    settings = get_settings()
    try:
        flow = InstalledAppFlow.from_client_secrets_file(
            str(settings.google_oauth_client_file), SCOPES
        )
        credentials = flow.run_local_server(
            port=0,
            open_browser=True,
            success_message="Google Docs terhubung. Tutup tab ini dan kembali ke Logpilot.",
        )
        _save_credentials(settings.google_oauth_token_file, credentials)
        with _state_lock:
            _flow_state = "connected"
    except Exception:
        with _state_lock:
            _flow_state = "failed"


def _load_credentials(path: Path) -> Credentials | None:
    if not path.is_file():
        return None
    try:
        return Credentials.from_authorized_user_file(str(path), SCOPES)
    except Exception:
        return None


def _save_credentials(path: Path, credentials: Credentials) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_file = path.with_name(path.name + ".tmp")
    temporary_file.write_text(credentials.to_json(), encoding="utf-8")
    temporary_file.replace(path)
