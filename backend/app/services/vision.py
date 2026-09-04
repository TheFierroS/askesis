"""
Görsel → metin (vision).

extraction.py bu modülü yalnızca yerel katmanlar (dijital metin + Tesseract)
başarısız olduğunda çağırıyor. Yani buraya gelen her istek token harcıyor;
zincirde ucuz/ücretsiz modeller önce geliyor.
"""

from __future__ import annotations

import base64
import logging

from app.config import get_settings
from app.prompts import VISION_OCR_PROMPT
from app.services.llm import AllProvidersFailed, complete

logger = logging.getLogger(__name__)


def _data_url(image_bytes: bytes, mime: str = "image/png") -> str:
    encoded = base64.b64encode(image_bytes).decode("utf-8")
    return f"data:{mime};base64,{encoded}"


def transcribe_image(image_bytes: bytes, mime: str = "image/png") -> str:
    """
    Tek bir görseli metne döker. Başarısız olursa boş string döner —
    çağıran taraf (extraction) buna göre needs_review işaretliyor, uygulama
    çökmüyor.
    """
    settings = get_settings()

    content = [
        {"type": "text", "text": VISION_OCR_PROMPT},
        {"type": "image_url", "image_url": {"url": _data_url(image_bytes, mime)}},
    ]

    try:
        return complete(
            system="Sen bir belge dijitalleştirme aracısın. Sadece görseldeki içeriği ver.",
            user=content,
            chain=settings.vision_chain,
            max_tokens=settings.vision_max_tokens,
            # Transkripsiyonda yaratıcılık istemiyoruz: aynı görsel aynı metni versin.
            temperature=0.0,
        )
    except AllProvidersFailed as exc:
        logger.error("Vision zinciri tükendi: %s", exc)
        return ""
