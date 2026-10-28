import re
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.core.config import get_settings


_EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
_PHONE = re.compile(r"(?<!\w)(?:\+?62|0)8(?:[\s.-]?\d){7,12}(?!\w)")
_IDENTIFIER = re.compile(r"\b(?:NIM|NPM|NIK|KTP)\s*[:#-]?\s*[A-Z0-9/-]+", re.IGNORECASE)
DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b"


class AIServiceError(Exception):
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
    if settings.ai_provider.strip().lower() != "groq":
        raise AIServiceError(503, "Provider AI belum didukung. Atur AI_PROVIDER=groq di backend/.env.")

    api_key = settings.groq_api_key.get_secret_value().strip() if settings.groq_api_key else ""
    if not api_key or api_key == "your_groq_api_key":
        raise AIServiceError(503, "API key Groq belum diatur. Isi GROQ_API_KEY di backend/.env.")

    model = settings.groq_model.strip() or DEFAULT_GROQ_MODEL

    try:
        from groq import (
            APIConnectionError,
            APIStatusError,
            APITimeoutError,
            AuthenticationError,
            BadRequestError,
            Groq,
            NotFoundError,
            RateLimitError,
        )
    except ImportError as error:
        raise AIServiceError(
            503,
            "Pustaka Groq belum terpasang. Jalankan .\\scripts\\setup.ps1 dari folder proyek, lalu mulai ulang API.",
        ) from error

    try:
        with Groq(api_key=api_key, timeout=30.0, max_retries=2) as client:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": input_text},
                ],
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": output_model.__name__.lower(),
                        "strict": False,
                        "schema": {**output_model.model_json_schema(), "additionalProperties": False},
                    },
                },
            )
    except AuthenticationError as error:
        raise AIServiceError(401, "API key Groq ditolak. Periksa GROQ_API_KEY di backend/.env.") from error
    except RateLimitError as error:
        raise AIServiceError(429, "Batas penggunaan Groq tercapai. Tunggu kuota pulih sebelum mencoba lagi.") from error
    except APITimeoutError as error:
        raise AIServiceError(504, "Permintaan ke Groq melewati waktu tunggu. Coba lagi.") from error
    except APIConnectionError as error:
        raise AIServiceError(503, "Groq tidak dapat dijangkau. Periksa koneksi internet, lalu coba lagi.") from error
    except NotFoundError as error:
        raise AIServiceError(503, f"Model Groq '{model}' tidak tersedia. Periksa nilai GROQ_MODEL.") from error
    except BadRequestError as error:
        raise AIServiceError(502, "Groq menolak model atau format keluaran. Periksa GROQ_MODEL dan coba lagi.") from error
    except APIStatusError as error:
        if error.status_code >= 500:
            raise AIServiceError(503, "Groq sedang mengalami gangguan. Coba lagi beberapa saat.") from error
        raise AIServiceError(502, "Groq tidak dapat memproses permintaan ini. Periksa konfigurasi model.") from error
    except Exception as error:
        raise AIServiceError(502, "Groq gagal membuat draf. Coba lagi atau periksa konfigurasi AI.") from error

    try:
        choices = response.choices
        content = choices[0].message.content if choices else None
        if not isinstance(content, str) or not content.strip():
            raise ValueError("empty AI response")
        return output_model.model_validate_json(content)
    except (AttributeError, IndexError, TypeError, ValueError, ValidationError) as error:
        raise AIServiceError(502, "Groq tidak menghasilkan jawaban yang valid. Periksa catatan lalu coba buat ulang.") from error
