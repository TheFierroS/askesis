"""
Kimlik doğrulama (Clerk).

Nasıl çalışıyor:
Frontend'de kullanıcı giriş yaptığında Clerk ona kısa ömürlü bir JWT veriyor.
Frontend bu token'ı her istekte `Authorization: Bearer <token>` başlığıyla
gönderiyor. Bizim işimiz token'ın sahte olmadığını doğrulamak.

Token Clerk'in özel anahtarıyla imzalanmış. Karşılık gelen genel anahtar
JWKS (JSON Web Key Set) adresinde yayınlanıyor. Genel anahtarla imzayı
doğrulayabiliyoruz ama taklit edemiyoruz — asimetrik imzanın bütün olayı bu.

Neden Clerk'in resmi SDK'sı değil?
PyJWT zaten kurulu ve yaptığımız iş standart JWT doğrulaması. Resmi SDK
(clerk-backend-api) ek bir bağımlılık ve kendi soyutlamaları demek; buradaki
40 satırın her adımı görünür ve denetlenebilir. İleride organizasyon yönetimi
gibi Clerk'e özgü özellikler gerekirse SDK'ya geçmek mantıklı olur.
"""

from __future__ import annotations

import logging
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, Request
from jwt import PyJWKClient

from app.config import get_settings

logger = logging.getLogger(__name__)

# Clerk oturum token'ları RS256 ile imzalanıyor. Algoritmayı sabitlemek şart:
# aksi halde saldırgan token'ın başlığına "alg": "none" yazıp imzasız token
# gönderebilir. Bu klasik bir JWT açığı.
ALGORITHMS = ["RS256"]


@lru_cache
def _jwks_client() -> PyJWKClient:
    """
    JWKS istemcisi. Genel anahtarları indirip önbellekte tutuyor.

    lru_cache olmadan her istekte Clerk'e HTTP çağrısı yapardık — hem yavaş
    hem gereksiz. PyJWKClient kendi içinde de anahtarları önbelleğe alıyor ve
    anahtar döndüğünde (key rotation) yeniden çekiyor.
    """
    settings = get_settings()
    return PyJWKClient(settings.clerk_jwks_url, cache_keys=True)


def _extract_token(request: Request) -> str | None:
    """
    Token'ı istekten çıkarır.

    İki yer: Authorization başlığı (farklı origin'den gelen istekler) veya
    __session çerezi (aynı origin). Bizim frontend ayrı portta çalıştığı için
    pratikte başlık kullanılacak, ama ikisini de destekliyoruz.
    """
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header[7:].strip()
    return request.cookies.get("__session")


def verify_token(token: str) -> dict:
    """
    Token'ı doğrular ve içindeki iddiaları (claims) döndürür.

    Doğrulanan şeyler:
    - İmza: Clerk'in genel anahtarıyla. Tek karakter değişse bozulur.
    - exp / nbf: PyJWT bunları otomatik kontrol ediyor. Clerk oturum
      token'larının ömrü 60 saniye; frontend sürekli yeniliyor.
    - azp: token'ı hangi origin'in ürettiği. Bu olmadan, saldırgan kendi
      Clerk uygulamasından aldığı geçerli bir token'la bizim API'ye
      girebilirdi — imza geçerli olurdu çünkü.
    """
    settings = get_settings()

    # Yapılandırma eksikse bu bir istemci hatası değil, sunucunun kurulum
    # eksiği. 401 dersek geliştirici "token'ım mı bozuk" diye arar; 503 ve
    # açık mesaj doğru yere bakmasını sağlıyor.
    if not settings.clerk_jwks_url:
        logger.error("CLERK_JWKS_URL tanımlı değil, doğrulama yapılamıyor")
        raise HTTPException(
            status_code=503,
            detail="Kimlik doğrulama yapılandırılmamış (CLERK_JWKS_URL).",
        )

    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=ALGORITHMS,
            # Clerk session token'larında "aud" yok; kontrolü kapatıyoruz.
            options={"verify_aud": False},
            leeway=10,  # saat farkı toleransı (saniye)
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Oturum süresi doldu.") from None
    except jwt.PyJWTError as exc:
        logger.warning("Token doğrulanamadı: %s", exc)
        raise HTTPException(status_code=401, detail="Geçersiz oturum.") from None

    # azp kontrolünü elle yapıyoruz: PyJWT bu iddiayı tanımıyor.
    if settings.clerk_authorized_parties:
        azp = claims.get("azp")
        if azp and azp not in settings.clerk_authorized_parties:
            logger.warning("Beklenmeyen azp: %s", azp)
            raise HTTPException(status_code=401, detail="Yetkisiz kaynak.")

    if not claims.get("sub"):
        raise HTTPException(status_code=401, detail="Token'da kullanıcı yok.")

    return claims


def current_user(request: Request) -> str:
    """
    Kullanıcı id'sini döndürür (Clerk'in `sub` iddiası).

    AUTH_DEV_MODE=true iken doğrulama atlanıyor ve X-User-Id başlığı
    kullanılıyor — frontend hazır olmadan API'yi denemek için. Açılışta
    uyarı basılıyor ki üretimde açık kalması gözden kaçmasın.
    """
    settings = get_settings()
    token = _extract_token(request)

    if settings.auth_dev_mode:
        # Dev modda bile gerçek token'ı tercih ediyoruz: frontend zaten Clerk
        # token'ı gönderiyor ve JWKS yapılandırılmışsa doğrulamanın çalıştığını
        # burada görmek istiyoruz. Token yoksa (Swagger'dan elle deneme) başlığa
        # düşüyoruz.
        if token and settings.clerk_jwks_url:
            return verify_token(token)["sub"]

        user_id = request.headers.get("X-User-Id")
        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Oturum yok. Dev modda X-User-Id başlığı gönder ya da "
                "geçerli bir Clerk token'ı ekle.",
            )
        return user_id

    if not token:
        raise HTTPException(status_code=401, detail="Oturum bulunamadı.")

    return verify_token(token)["sub"]


def require_admin(user_id: str = Depends(current_user)) -> str:
    """
    Admin yetkisi kontrolü.

    Basit bir izin listesi: Clerk kullanıcı id'lerini .env'e yazıyoruz.
    Neden rol tabanlı değil?
    Clerk'te rol taşımak için ya JWT şablonu tanımlaman ya da her istekte
    Clerk API'sine sorman gerekiyor. İki-üç adminli bir proje için izin
    listesi hem yeterli hem de dışarıdan bir çağrıya bağlı değil. Admin
    sayısı arttığında publicMetadata.role'a geçeriz.
    """
    settings = get_settings()

    if not settings.clerk_admin_user_ids:
        raise HTTPException(
            status_code=503,
            detail="Admin listesi tanımlı değil (CLERK_ADMIN_USER_IDS).",
        )

    if user_id not in settings.clerk_admin_user_ids:
        # 404 değil 403: kaynak var ama yetkin yok.
        raise HTTPException(status_code=403, detail="Bu işlem için yetkin yok.")

    return user_id


def auth_status() -> dict:
    """Sağlık kontrolü için: kimlik doğrulama nasıl yapılandırılmış."""
    settings = get_settings()
    return {
        "mode": "DEV (doğrulama kapalı)" if settings.auth_dev_mode else "clerk",
        "jwks_configured": bool(settings.clerk_jwks_url),
        "admin_count": len(settings.clerk_admin_user_ids),
    }