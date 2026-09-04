"""
Yüklenen sınav dosyalarının saklanması.

Neden saklıyoruz?
Metni çıkarıp dosyayı atmak yeterli görünüyor ama iki şeyi imkânsız kılıyor:
admin panelinde "bu sınavı bir göreyim" demek ve yanlış yüklenen bir dosyayı
kaynağıyla birlikte silmek. Sınav başına ~200 KB; yüz sınav 20 MB, önemsiz.

Neden veritabanına değil de diske?
Dosyalar ikili ve büyük. SQLite'a BLOB olarak koymak veritabanını şişirir ve
her yedeklemede hepsini taşımak gerekir. Diskte dururlarsa web sunucusu
doğrudan servis edebilir.
"""

from __future__ import annotations

import logging
from pathlib import Path

from app.config import get_settings

logger = logging.getLogger(__name__)

# Kabul edilen uzantılar. Bunun dışındaki bir uzantıyı dosya adından alıp
# diske yazmak, saldırganın istediği uzantıyla dosya oluşturmasına yol açar.
ALLOWED_SUFFIXES = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".txt"}


def _root() -> Path:
    path = Path(get_settings().uploads_path)
    path.mkdir(parents=True, exist_ok=True)
    return path


def save(document_id: str, filename: str, content: bytes) -> str:
    """
    Dosyayı doküman id'siyle saklar.

    Dosya adını KULLANMIYORUZ, sadece uzantısını alıyoruz. Kullanıcının
    gönderdiği ad "../../etc/passwd" olabilir; id ise bizim ürettiğimiz UUID.
    """
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        suffix = ".bin"

    target = _root() / f"{document_id}{suffix}"
    target.write_bytes(content)
    logger.info("Dosya saklandı: %s (%d bayt)", target.name, len(content))
    return target.name


def find(document_id: str) -> Path | None:
    """Doküman id'sine ait dosyayı bulur. Uzantı bilinmediği için tarıyoruz."""
    for path in _root().glob(f"{document_id}.*"):
        return path
    return None


def delete(document_id: str) -> bool:
    path = find(document_id)
    if not path:
        return False
    path.unlink()
    logger.info("Dosya silindi: %s", path.name)
    return True


def media_type(path: Path) -> str:
    return {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".txt": "text/plain; charset=utf-8",
    }.get(path.suffix.lower(), "application/octet-stream")


# ----------------------------------------------------------------- şekiller


def _figures_root() -> Path:
    """
    Şekiller ayrı klasörde: yüklenen sınav dosyalarıyla karışmasınlar.
    Biri admin'in yüklediği kaynak, diğeri bizim ürettiğimiz türev veri —
    yedekleme ve temizleme kuralları farklı olabilir.
    """
    path = Path(get_settings().uploads_path).parent / "figures"
    path.mkdir(parents=True, exist_ok=True)
    return path


def save_figure(question_id: str, data: bytes) -> None:
    (_figures_root() / f"{question_id}.png").write_bytes(data)
    logger.info("Şekil kaydedildi: %s (%d bayt)", question_id, len(data))


def find_figure(question_id: str) -> Path | None:
    path = _figures_root() / f"{question_id}.png"
    return path if path.exists() else None


def delete_figure(question_id: str) -> bool:
    path = find_figure(question_id)
    if not path:
        return False
    path.unlink()
    return True