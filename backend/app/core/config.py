from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "sqlite:///./data/logbook.db"
    gemini_api_key: SecretStr | None = None
    gemini_model: str = ""

    @property
    def google_oauth_client_file(self) -> Path:
        return Path(__file__).resolve().parents[2] / ".local" / "google-oauth-client.json"

    @property
    def google_oauth_token_file(self) -> Path:
        return Path(__file__).resolve().parents[2] / ".local" / "google-token.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
