import builtins
import os
import unittest
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import httpx
from groq import APIConnectionError, APITimeoutError, AuthenticationError, NotFoundError, RateLimitError
from pydantic import BaseModel, Field, SecretStr
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.db.base import Base
from app.db.models import LogbookEntry
from app.services.ai_service import AIServiceError, generate_structured_response
from app.services.reflection_service import generate_week_reflection, get_week_reflection
from app.services.result_service import ResultDraft, generate_result_draft


class Draft(BaseModel):
    summary: str = Field(min_length=1, max_length=100)


class GroqConfigurationTests(unittest.TestCase):
    def test_env_selects_groq_and_allows_a_model_override(self):
        with patch.dict(os.environ, {"AI_PROVIDER": "groq"}, clear=True):
            default_settings = Settings(_env_file=None)
        with patch.dict(os.environ, {"AI_PROVIDER": "groq", "GROQ_MODEL": "custom/model"}, clear=True):
            custom_settings = Settings(_env_file=None)

        self.assertEqual(default_settings.ai_provider, "groq")
        self.assertEqual(default_settings.groq_model, "openai/gpt-oss-20b")
        self.assertEqual(custom_settings.groq_model, "custom/model")


def settings(api_key: str | None = "groq-test-key", model: str = "openai/gpt-oss-20b"):
    return SimpleNamespace(
        ai_provider="groq",
        groq_api_key=SecretStr(api_key) if api_key else None,
        groq_model=model,
    )


def completion(content: str | None):
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])


def status_error(error_type, status_code: int):
    request = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    response = httpx.Response(status_code, request=request)
    return error_type("provider error", response=response, body={"error": {"message": "provider error"}})


class GroqServiceTests(unittest.TestCase):
    def test_generates_and_validates_a_structured_response(self):
        client = MagicMock()
        client.__enter__.return_value = client
        client.chat.completions.create.return_value = completion('{"summary":"Hasil yang didukung catatan."}')

        with patch("app.services.ai_service.get_settings", return_value=settings()), patch(
            "groq.Groq", return_value=client
        ) as groq_client:
            result = generate_structured_response("Ikuti fakta sumber.", "Catatan kerja.", Draft)

        self.assertEqual(result.summary, "Hasil yang didukung catatan.")
        groq_client.assert_called_once_with(api_key="groq-test-key", timeout=30.0, max_retries=2)
        request = client.chat.completions.create.call_args.kwargs
        self.assertEqual(request["model"], "openai/gpt-oss-20b")
        self.assertEqual(request["messages"], [
            {"role": "system", "content": "Ikuti fakta sumber."},
            {"role": "user", "content": "Catatan kerja."},
        ])
        self.assertEqual(request["response_format"]["type"], "json_schema")
        self.assertFalse(request["response_format"]["json_schema"]["strict"])
        self.assertFalse(request["response_format"]["json_schema"]["schema"]["additionalProperties"])

    def test_reports_missing_api_key_without_creating_a_client(self):
        with patch("app.services.ai_service.get_settings", return_value=settings(api_key=None)), patch(
            "groq.Groq"
        ) as groq_client:
            with self.assertRaises(AIServiceError) as raised:
                generate_structured_response("system", "input", Draft)

        self.assertEqual(raised.exception.status_code, 503)
        self.assertIn("GROQ_API_KEY", raised.exception.detail)
        groq_client.assert_not_called()

    def test_missing_sdk_disables_ai_request_without_breaking_service_imports(self):
        real_import = builtins.__import__

        def import_without_groq(name, *args, **kwargs):
            if name == "groq":
                raise ImportError("Groq SDK is unavailable")
            return real_import(name, *args, **kwargs)

        with patch("app.services.ai_service.get_settings", return_value=settings()), patch(
            "builtins.__import__", side_effect=import_without_groq
        ):
            with self.assertRaises(AIServiceError) as raised:
                generate_structured_response("system", "input", Draft)

        self.assertEqual(raised.exception.status_code, 503)
        self.assertIn("Pustaka Groq", raised.exception.detail)

    def test_rejects_an_unsupported_provider_without_stopping_application_startup(self):
        unsupported = settings()
        unsupported.ai_provider = "other"

        with patch("app.services.ai_service.get_settings", return_value=unsupported):
            with self.assertRaises(AIServiceError) as raised:
                generate_structured_response("system", "input", Draft)

        self.assertEqual(raised.exception.status_code, 503)

    def test_maps_invalid_api_key(self):
        self._assert_provider_error(
            status_error(AuthenticationError, 401), 401, "API key Groq", expected_retries=2
        )

    def test_maps_rate_limit_and_configures_bounded_sdk_retries(self):
        self._assert_provider_error(
            status_error(RateLimitError, 429), 429, "batas penggunaan", expected_retries=2
        )

    def test_maps_timeout(self):
        request = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
        self._assert_provider_error(APITimeoutError(request), 504, "waktu tunggu")

    def test_maps_connection_failure(self):
        request = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
        self._assert_provider_error(APIConnectionError(message="offline", request=request), 503, "koneksi")

    def test_maps_unavailable_model(self):
        self._assert_provider_error(status_error(NotFoundError, 404), 503, "Model Groq")

    def test_rejects_empty_and_invalid_output(self):
        for content in (None, "", "not-json", '{"summary":""}'):
            with self.subTest(content=content):
                client = MagicMock()
                client.__enter__.return_value = client
                client.chat.completions.create.return_value = completion(content)
                with patch("app.services.ai_service.get_settings", return_value=settings()), patch(
                    "groq.Groq", return_value=client
                ):
                    with self.assertRaises(AIServiceError) as raised:
                        generate_structured_response("system", "input", Draft)
                self.assertEqual(raised.exception.status_code, 502)

    def _assert_provider_error(self, error, status_code: int, message: str, expected_retries: int | None = None):
        client = MagicMock()
        client.__enter__.return_value = client
        client.chat.completions.create.side_effect = error

        with patch("app.services.ai_service.get_settings", return_value=settings()), patch(
            "groq.Groq", return_value=client
        ) as groq_client:
            with self.assertRaises(AIServiceError) as raised:
                generate_structured_response("system", "input", Draft)

        self.assertEqual(raised.exception.status_code, status_code)
        self.assertIn(message.lower(), raised.exception.detail.lower())
        if expected_retries is not None:
            self.assertEqual(groq_client.call_args.kwargs["max_retries"], expected_retries)


class AIPromptTests(unittest.TestCase):
    def test_daily_result_prompt_redacts_identifiers_before_calling_groq(self):
        with patch("app.services.result_service.generate_structured_response") as generate:
            generate.return_value = ResultDraft(result_text="Hasil ringkas.")

            result = generate_result_draft(
                "Menyusun laporan untuk NIM 12345678 dan mengirimnya ke khaliz@example.com."
            )

        self.assertEqual(result, "Hasil ringkas.")
        system_instruction = generate.call_args.kwargs["system_instruction"]
        input_text = generate.call_args.kwargs["input_text"]
        self.assertIn("Jangan mengarang hasil", system_instruction)
        self.assertIn("[nomor identitas disamarkan]", input_text)
        self.assertIn("[email disamarkan]", input_text)
        self.assertNotIn("12345678", input_text)
        self.assertNotIn("khaliz@example.com", input_text)

    def test_weekly_reflection_uses_week_data_and_returns_missing_day_warning(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        friday = date(2026, 10, 23)
        with Session(engine) as session:
            session.add(LogbookEntry(date=date(2026, 10, 19), activity_text="Menyusun rancangan NIM 12345678"))
            session.commit()
            snapshot = get_week_reflection(session, friday)
            generated = SimpleNamespace(reflection_text="Saya menyusun rancangan berdasarkan catatan.")

            with patch("app.services.reflection_service.generate_structured_response", return_value=generated) as call:
                result = generate_week_reflection(
                    session,
                    friday,
                    snapshot["source_hash"],
                    privacy_confirmed=True,
                    regenerate=False,
                )

        engine.dispose()
        self.assertEqual(result["missing_dates"], ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"])
        self.assertIn("2026-10-19", call.call_args.kwargs["input_text"])
        self.assertIn("[nomor identitas disamarkan]", call.call_args.kwargs["input_text"])
        self.assertIn("Jangan mengarang", call.call_args.kwargs["system_instruction"])
        self.assertIn("formal, natural, dan ringkas", call.call_args.kwargs["system_instruction"])
        self.assertNotIn("12345678", call.call_args.kwargs["input_text"])
        for workday in ("2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"):
            self.assertIn(workday, call.call_args.kwargs["input_text"])


if __name__ == "__main__":
    unittest.main()
