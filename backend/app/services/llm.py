"""
LLM katmanı: çok sağlayıcılı yönlendirici.

Neden Groq SDK değil de httpx?
Groq, OpenRouter ve Google AI Studio'nun üçü de OpenAI-uyumlu
`/chat/completions` endpoint'i sunuyor. Tek bir HTTP çağrısıyla üçüne de
gidebiliyoruz. Her sağlayıcı için ayrı SDK kurmak yerine tek bir istemci
tutmak, yeni sağlayıcı eklemeyi "config'e satır ekle" seviyesine indiriyor.

Zincir mantığı:
Ayarlardaki zincir "sağlayıcı:model" biçiminde sıralı bir liste. İlk halka
başarısız olursa (429, zaman aşımı, bozuk JSON) sıradakine geçilir. Bir
sağlayıcı 429 verdiğinde o sağlayıcı belirli bir süre "soğumaya" alınır;
zincirde tekrar denenmez, boşuna istek harcanmaz.

Önemli: Aynı sağlayıcıda ikinci hesap açmak kota kazandırmaz (Groq org
seviyesinde, Google proje seviyesinde, OpenRouter hesap seviyesinde sayıyor)
ve üçünün de kullanım şartlarına aykırı. Kapasite artışı farklı sağlayıcılardan
gelir, aynı sağlayıcının kopyalarından değil.
"""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from typing import Any, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from app.config import get_settings

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# Sağlayıcı adı -> OpenAI uyumlu endpoint kökü
PROVIDER_ENDPOINTS: dict[str, str] = {
    "groq": "https://api.groq.com/openai/v1/chat/completions",
    "openrouter": "https://openrouter.ai/api/v1/chat/completions",
    # Google'ın OpenAI uyumluluk katmanı; native SDK gerekmiyor.
    "google": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
}

# 429 sonrası sağlayıcının dinlendirileceği süre (saniye).
COOLDOWN_SECONDS = 60

REQUEST_TIMEOUT = httpx.Timeout(90.0, connect=10.0)


class AllProvidersFailed(RuntimeError):
    """Zincirdeki her halka denendi, hiçbiri geçerli yanıt vermedi."""


class ProviderError(RuntimeError):
    """
    Sağlayıcıdan gelen HTTP hatası — yanıt gövdesiyle birlikte.

    httpx'in raise_for_status'ü sadece durum kodunu veriyor, gövdeyi atıyor.
    Oysa asıl bilgi gövdede: "model not found: x", "unsupported content type"
    gibi. 400/404 hatalarını gövdesiz görmek kör hata ayıklama demek.
    """


@dataclass
class Attempt:
    provider: str
    model: str


# Sağlayıcı bazında "şu ana kadar soğumada" damgası.
# Tek süreçte çalıştığımız sürece bellekte tutmak yeterli; birden fazla
# worker'a çıkarsak burası Redis'e taşınmalı.
_cooldowns: dict[str, float] = {}


def _parse_chain(chain: list[str]) -> list[Attempt]:
    """['groq:qwen/x', 'openrouter/y:free'] -> [Attempt(...), ...]"""
    attempts: list[Attempt] = []
    for entry in chain:
        provider, _, model = entry.partition(":")
        if not model:
            logger.warning("Zincir girdisi hatalı, atlanıyor: %s", entry)
            continue
        attempts.append(Attempt(provider=provider.strip(), model=model.strip()))
    return attempts


def _api_key(provider: str) -> str:
    settings = get_settings()
    return {
        "groq": settings.groq_api_key,
        "openrouter": settings.openrouter_api_key,
        "google": settings.google_api_key,
    }.get(provider, "")


def _is_cooling(provider: str) -> bool:
    until = _cooldowns.get(provider, 0.0)
    return time.monotonic() < until


def _start_cooldown(provider: str, seconds: int = COOLDOWN_SECONDS) -> None:
    _cooldowns[provider] = time.monotonic() + seconds
    logger.info("%s soğumaya alındı (%ss)", provider, seconds)


def _clean(raw: str) -> str:
    """
    Model çıktısını temizler.

    İki şey siliniyor:
    - <think>...</think> blokları (reasoning modelleri bunu metne karıştırıyor)
    - ```json ... ``` kod bloğu çitleri (JSON modunda bile bazen ekliyorlar)
    """
    text = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL)
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE)
    return text.strip()


def _prepare_payload(
    attempt: Attempt, payload: dict[str, Any], reasoning_effort: str | None
) -> dict[str, Any]:
    """
    Sağlayıcıya özgü alan farklarını burada kapatıyoruz.

    Groq'ta iki şey önemli:

    1. Akıl yürüten modeller (gpt-oss gibi) cevabı yazmadan önce görünmeyen
       "düşünme" token'ı harcıyor. `max_tokens` bu ikisini birlikte sayıyor ve
       model JSON'u tamamlayamadan bütçe bitiyor — sağlayıcı da
       "json_validate_failed" hatası veriyor. `max_completion_tokens` doğru alan.

    2. `reasoning_effort` ile düşünme miktarını kontrol edebiliyoruz. Üretimde
       "none" (hız ve token), denetimde daha yüksek (doğruluk).

    Bu alanlar Groq'a özgü; Google ve OpenRouter'a gönderirsek 400 alırız.
    """
    prepared = dict(payload)

    if attempt.provider == "groq":
        if "max_tokens" in prepared:
            prepared["max_completion_tokens"] = prepared.pop("max_tokens")
        if reasoning_effort:
            prepared["reasoning_effort"] = reasoning_effort

    return prepared


def _post(
    attempt: Attempt,
    payload: dict[str, Any],
    reasoning_effort: str | None = None,
) -> str:
    """Tek bir sağlayıcıya istek atar, mesaj içeriğini döndürür."""
    key = _api_key(attempt.provider)
    if not key:
        raise RuntimeError(f"{attempt.provider} için API anahtarı tanımlı değil")

    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    if attempt.provider == "openrouter":
        # OpenRouter kendi sıralamalarında göstermek için bunları istiyor;
        # zorunlu değil ama göndermek nazik ve bazı modellerde önceliklendiriyor.
        headers["HTTP-Referer"] = "https://sinav-ai.local"
        headers["X-Title"] = "Sinav AI"

    with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
        response = client.post(
            PROVIDER_ENDPOINTS[attempt.provider],
            headers=headers,
            json={
                **_prepare_payload(attempt, payload, reasoning_effort),
                "model": attempt.model,
            },
        )

    if response.status_code == 429:
        _start_cooldown(attempt.provider)
        raise ProviderError(f"{attempt.provider}: kota doldu (429)")

    if response.status_code >= 400:
        # Gövdeyi kısaltarak da olsa hataya ekliyoruz: model id yanlışsa,
        # içerik biçimi desteklenmiyorsa sağlayıcı burada söylüyor.
        detail = response.text.strip()[:400]
        raise ProviderError(
            f"{attempt.provider}/{attempt.model} -> HTTP {response.status_code}: {detail}"
        )

    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise ProviderError(f"{attempt.provider}: yanıtta choices yok -> {str(data)[:300]}")

    return choices[0]["message"].get("content") or ""


def complete(
    *,
    system: str,
    user: str | list[dict[str, Any]],
    chain: list[str],
    max_tokens: int,
    json_mode: bool = False,
    temperature: float = 0.7,
    reasoning_effort: str | None = None,
) -> str:
    """
    Zinciri sırayla dener, ilk başarılı yanıtı döndürür.

    `user` ya düz metin ya da çok parçalı içerik (görsel + metin) olabilir;
    ikincisi vision çağrıları için.
    """
    attempts = _parse_chain(chain)
    last_error: Exception | None = None

    for attempt in attempts:
        if _is_cooling(attempt.provider):
            logger.debug("%s soğumada, atlanıyor", attempt.provider)
            continue
        if not _api_key(attempt.provider):
            continue

        payload: dict[str, Any] = {
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        try:
            content = _post(attempt, payload, reasoning_effort)
            if content.strip():
                logger.info("Yanıt alındı: %s / %s", attempt.provider, attempt.model)
                return _clean(content)
            last_error = RuntimeError("boş yanıt")
        except Exception as exc:  # noqa: BLE001 - zincirde devam etmek istiyoruz
            logger.warning("%s/%s başarısız: %s", attempt.provider, attempt.model, exc)
            last_error = exc

    raise AllProvidersFailed(
        f"Zincirdeki hiçbir sağlayıcı yanıt vermedi. Son hata: {last_error}"
    )


# ------------------------------------------------------------ JSON onarımı

# JSON'da geçerli kaçışlar. Bunların dışındaki her `\x` tanımsız.
_VALID_ESCAPES = set('"\\/bfnrtu')

# Ayrıştırma sırasında kaybolan LaTeX komutları.
#
# `\f`, `\b`, `\v`, `\a` JSON'da GEÇERLİ kaçışlar; `\frac` ayrıştırıldığında
# sessizce "formfeed + rac" oluyor. Hata verilmiyor, formül bozuluyor. Metnimizde
# bu kontrol karakterlerinin hiçbir meşru kullanımı yok, o yüzden geri
# çevirmek güvenli.
#
# `\n` ve `\t` LİSTEDE DEĞİL: satır sonu ve sekme gerçekten kullanılıyor.
# `\nabla` ve `\theta` bu yüzden hâlâ bozulabilir, ama satır sonlarını feda
# etmek çok daha büyük zarar verirdi.
_CONTROL_TO_LATEX = {
    "\x0c": "\\f",  # \frac, \forall
    "\x08": "\\b",  # \beta, \bmatrix
    "\x0b": "\\v",  # \vec, \varphi
    "\x07": "\\a",  # \alpha, \angle
}


def _repair_json_escapes(raw: str) -> str:
    """
    Tanımsız kaçışları çift ters bölüye çevirir.

    Model LaTeX'i JSON dizesine tek ters bölüyle yazıyor: "an angle $\alpha$".
    `\a` geçerli bir JSON kaçışı olmadığı için ayrıştırma tamamen çöküyor ve
    o partideki bütün sorular kaybediliyor.

    Yalnızca GEÇERSİZ olanlara dokunuyoruz; `\n` ve `\"` gibi kasıtlı
    kaçışlar olduğu gibi kalıyor.
    """
    out: list[str] = []
    i = 0

    while i < len(raw):
        char = raw[i]
        if char == "\\" and i + 1 < len(raw):
            nxt = raw[i + 1]
            if nxt in _VALID_ESCAPES:
                out.append(char)
                out.append(nxt)
            else:
                # Tanımsız kaçış: ters bölüyü kaçırarak metne dahil et.
                out.append("\\\\")
                out.append(nxt)
            i += 2
            continue
        out.append(char)
        i += 1

    return "".join(out)


def _restore_latex_controls(text: str) -> str:
    """Ayrıştırma sırasında kontrol karakterine dönüşmüş LaTeX'i geri alır."""
    for control, latex in _CONTROL_TO_LATEX.items():
        text = text.replace(control, latex)
    return text


def _clean_parsed(value):
    """Ayrıştırılmış yapıdaki bütün metinleri onarır."""
    if isinstance(value, str):
        return _restore_latex_controls(value)
    if isinstance(value, list):
        return [_clean_parsed(item) for item in value]
    if isinstance(value, dict):
        return {key: _clean_parsed(item) for key, item in value.items()}
    return value


def complete_json(
    *,
    system: str,
    user: str,
    chain: list[str],
    schema: type[T],
    max_tokens: int,
    temperature: float = 0.7,
    reasoning_effort: str | None = None,
) -> T:
    """
    JSON bekleyen çağrılar için: yanıtı ayrıştırır ve Pydantic şemasıyla doğrular.

    Kritik nokta: doğrulama başarısız olursa zincirde bir sonrakine geçiyoruz.
    Eski koddaki `data.get("questions", [])` yaklaşımı bozuk yanıtı sessizce
    kabul ediyordu; burada bozuk yanıt "bu model olmadı" demek ve bir sonraki
    model deneniyor.
    """
    attempts = _parse_chain(chain)
    last_error: Exception | None = None

    for attempt in attempts:
        if _is_cooling(attempt.provider) or not _api_key(attempt.provider):
            continue

        payload = {
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
            "response_format": {"type": "json_object"},
        }

        try:
            raw = _clean(_post(attempt, payload, reasoning_effort))

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                # Büyük olasılıkla LaTeX'ten gelen tanımsız kaçış: onarıp
                # bir kez daha dene. Başarısız olursa hata yukarı gidiyor ve
                # zincirde bir sonraki sağlayıcıya geçiliyor.
                data = json.loads(_repair_json_escapes(raw))
                logger.info("%s: JSON kaçışları onarıldı", attempt.provider)

            return schema.model_validate(_clean_parsed(data))
        except ValidationError as exc:
            # Model JSON döndürdü ama şemaya uymuyor: eksik alan, yanlış tip,
            # istenen sayıda soru gelmemiş olabilir.
            logger.warning(
                "%s/%s şemaya uymayan yanıt verdi: %s",
                attempt.provider,
                attempt.model,
                exc.errors()[:2],
            )
            last_error = exc
        except json.JSONDecodeError as exc:
            logger.warning("%s/%s geçersiz JSON: %s", attempt.provider, attempt.model, exc)
            last_error = exc
        except Exception as exc:  # noqa: BLE001
            logger.warning("%s/%s başarısız: %s", attempt.provider, attempt.model, exc)
            last_error = exc

    raise AllProvidersFailed(
        f"Zincirdeki hiçbir sağlayıcı geçerli JSON vermedi. Son hata: {last_error}"
    )


def provider_status() -> dict[str, str]:
    """Sağlık kontrolü endpoint'i için: hangi sağlayıcı hazır, hangisi soğumada."""
    status: dict[str, str] = {}
    for provider in PROVIDER_ENDPOINTS:
        if not _api_key(provider):
            status[provider] = "anahtar yok"
        elif _is_cooling(provider):
            remaining = int(_cooldowns[provider] - time.monotonic())
            status[provider] = f"soğumada ({remaining}s)"
        else:
            status[provider] = "hazır"
    return status