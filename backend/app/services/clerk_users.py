"""
Clerk kullanıcı bilgisi.

Admin panelinde `user_2abc...` gibi bir kimlik hiçbir şey ifade etmiyor.
İsim ve e-posta Clerk'te duruyor; biz kopyalamıyoruz.

Neden kopyalamıyoruz?
Kullanıcı adını değiştirdiğinde ya da hesabını sildiğinde iki yerde tutulan
veri ayrışır. Kimlik doğrulama Clerk'in işi, kişisel veriyi de orada bırakmak
hem doğru hem KVKK açısından daha temiz: bizim veritabanımızda yalnızca
anonim bir kimlik ve bakiye var.

Önbellek: aynı isteği her panel açılışında tekrarlamamak için kısa süreli.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

CLERK_API = "https://api.clerk.com/v1/users"
CACHE_TTL = 300  # saniye
REQUEST_TIMEOUT = 15.0


@dataclass
class ClerkUser:
    user_id: str
    name: str
    email: str


# user_id -> (kayıt, zaman damgası)
_cache: dict[str, tuple[ClerkUser, float]] = {}


def _from_payload(payload: dict) -> ClerkUser:
    first = (payload.get("first_name") or "").strip()
    last = (payload.get("last_name") or "").strip()
    name = " ".join(part for part in (first, last) if part)

    # Birincil e-posta: Clerk birden fazla adres tutabiliyor.
    primary_id = payload.get("primary_email_address_id")
    email = ""
    for address in payload.get("email_addresses", []):
        if address.get("id") == primary_id:
            email = address.get("email_address", "")
            break
    if not email and payload.get("email_addresses"):
        email = payload["email_addresses"][0].get("email_address", "")

    return ClerkUser(
        user_id=payload.get("id", ""),
        name=name or (email.split("@")[0] if email else ""),
        email=email,
    )


def fetch(user_ids: list[str]) -> dict[str, ClerkUser]:
    """
    Verilen kimlikler için isim ve e-posta getirir.

    Tek tek değil toplu istek: 50 kullanıcı için 50 HTTP çağrısı yapmak yerine
    Clerk'in user_id filtresiyle bir çağrı yetiyor.

    Anahtar tanımlı değilse ya da istek başarısız olursa boş sözlük dönüyor;
    panel kimlikleri göstermeye devam ediyor, çökmüyor.
    """
    settings = get_settings()
    if not settings.clerk_secret_key or not user_ids:
        return {}

    now = time.monotonic()
    result: dict[str, ClerkUser] = {}
    missing: list[str] = []

    for user_id in user_ids:
        cached = _cache.get(user_id)
        if cached and now - cached[1] < CACHE_TTL:
            result[user_id] = cached[0]
        else:
            missing.append(user_id)

    if not missing:
        return result

    try:
        response = httpx.get(
            CLERK_API,
            headers={"Authorization": f"Bearer {settings.clerk_secret_key}"},
            # Clerk aynı parametreyi tekrarlayarak çoklu filtre kabul ediyor.
            params=[("user_id", uid) for uid in missing] + [("limit", "100")],
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Clerk kullanıcı bilgisi alınamadı: %s", exc)
        return result

    for payload in response.json():
        user = _from_payload(payload)
        if user.user_id:
            _cache[user.user_id] = (user, now)
            result[user.user_id] = user

    return result