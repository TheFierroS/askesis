"""
Sağlayıcıların gerçekten sunduğu model id'lerini listeler.

Kullanım (proje kökünden):
    python -m scripts.list_models
    python -m scripts.list_models --filter vision
    python -m scripts.list_models --provider google

Neden gerekli:
Model id'leri sık değişiyor. Google'ın 2.5 serisi emekliye ayrılmış olabilir,
OpenRouter'ın ücretsiz listesi haber vermeden rotasyona giriyor. config.py'deki
zincirleri elle güncellerken doğru id'yi buradan alacaksın.
"""

from __future__ import annotations

import argparse
import sys

import httpx

from app.config import get_settings

ENDPOINTS = {
    "groq": "https://api.groq.com/openai/v1/models",
    "openrouter": "https://openrouter.ai/api/v1/models",
    "google": "https://generativelanguage.googleapis.com/v1beta/openai/models",
}

# Görsel destekleyen modelleri tahmin etmek için kaba ipuçları.
VISION_HINTS = ("vision", "-vl", "gemini", "llava", "gpt-4o", "multimodal", "flash")


def fetch(provider: str, key: str) -> list[dict]:
    response = httpx.get(
        ENDPOINTS[provider],
        headers={"Authorization": f"Bearer {key}"},
        timeout=30.0,
    )
    if response.status_code >= 400:
        print(f"  HATA {response.status_code}: {response.text[:200]}")
        return []
    payload = response.json()
    return payload.get("data", payload.get("models", []))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", choices=list(ENDPOINTS), default=None)
    parser.add_argument(
        "--filter",
        default="",
        help="id içinde geçmesi gereken metin. 'vision' yazarsan görsel "
        "destekleyen modelleri tahmin eder.",
    )
    parser.add_argument("--free-only", action="store_true", help="Sadece :free olanlar")
    args = parser.parse_args()

    settings = get_settings()
    keys = {
        "groq": settings.groq_api_key,
        "openrouter": settings.openrouter_api_key,
        "google": settings.google_api_key,
    }

    providers = [args.provider] if args.provider else list(ENDPOINTS)

    for provider in providers:
        key = keys[provider]
        print(f"\n{'=' * 60}\n{provider.upper()}\n{'=' * 60}")
        if not key:
            print("  anahtar tanımlı değil, atlanıyor")
            continue

        models = fetch(provider, key)
        ids = sorted(m.get("id", "") for m in models if m.get("id"))

        if args.free_only:
            ids = [i for i in ids if i.endswith(":free")]
        if args.filter == "vision":
            ids = [i for i in ids if any(h in i.lower() for h in VISION_HINTS)]
        elif args.filter:
            ids = [i for i in ids if args.filter.lower() in i.lower()]

        print(f"  {len(ids)} model")
        for model_id in ids:
            print(f"    {model_id}")

    print(
        "\nBu id'leri app/config.py içindeki zincirlere "
        '"sağlayıcı:model" biçiminde yaz.'
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
