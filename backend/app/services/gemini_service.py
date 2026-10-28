import re
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.core.config import get_settings


_EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
_PHONE = re.compile(r"(?<!\w)(?:\+?62|0)8(?:[\s.-]?\d){7,12}(?!\w)")
_IDENTIFIER = re.compile(r"\b(?:NIM|NPM|NIK|KTP)\s*[:#-]?\s*[A-Z0-9/-]+", re.IGNORECASE)


class GeminiServiceError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail


OutputModel = TypeVar("OutputModel", bound=BaseModel)


def redact_personal_data(value: str) -> str:
    value = _EMAIL.sub("[email disamarkan]", value)
    value = _PHONE.sub("[nomor telepon disamarkan]", value)
    return _IDENTIFIER.sub("[nomor identitas disamarkan]", value)


def generate_structured_response(
    system_instruction: str,
    input_text: str,
    output_model: type[OutputModel],
) -> OutputModel:
    settings = get_settings()
    api_key = settings.gemini_api_key.get_secret_value().strip() if settings.gemini_api_key else ""
    if not api_key:
        raise GeminiServiceError(503, "API key Gemini belum diatur. Lengkapi GEMINI_API_KEY di backend/.env.")
    if not settings.gemini_model.strip():
        raise GeminiServiceError(503, "Model Gemini belum diatur. Lengkapi GEMINI_MODEL di backend/.env.")

    try:
        from google import genai
    except ImportError as error:
        raise GeminiServiceError(
            503,
            "Pustaka Gemini belum terpasang. Jalankan pip install -r requirements.txt di folder backend, lalu mulai ulang API.",
        ) from error

    try:
        with genai.Client(api_key=api_key) as client:
            response = client.interactions.create(
                model=settings.gemini_model.strip(),
                system_instruction=system_instruction,
                input=input_text,
                response_format={
                    "type": "text",
                    "mime_type": "application/json",
                    "schema": output_model.model_json_schema(),
                },
                store=False,
                timeout=60,
            )
        return output_model.model_validate_json(response.output_text or "")
    except ValidationError as error:
        raise GeminiServiceError(502, "Gemini belum menghasilkan jawaban yang bisa digunakan. Coba buat ulang.") from error
    except Exception as error:
        raise GeminiServiceError(502, "Gemini tidak dapat membuat draf saat ini. Periksa model, koneksi, atau kuota API.") from error
