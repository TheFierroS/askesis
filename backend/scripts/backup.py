"""
Yedekleme.

NE KAYBEDİLİRSE NE OLUR
  pool.db      → havuz, krediler, sınav geçmişi, teslimat kaydı.
                 Gitmesi: kullanıcıların bakiyesi ve geçmişi silinir.
  chroma/      → referans sorular ve konu etiketleri.
                 Gitmesi: sınavları yeniden yüklemek gerekir; her taranmış
                 dosya yeniden vision'a gider, yani para.
  uploads/     → yüklenen sınav dosyaları (önizleme ve yeniden işleme için).
  figures/     → üretilmiş şekiller. Yeniden üretilebilir ama karşılığı olan
                 sorular şekilsiz kalır.

SQLITE NEDEN KOPYALANMIYOR
WAL modunda veritabanı üç dosyaya yayılıyor (.db, .db-wal, .db-shm). Yazma
sırasında .db dosyasını kopyalamak yarım bir kopya veriyor — açılıyor ama
son işlemler eksik. `sqlite3.backup()` API'si veritabanını kilitleyip tutarlı
bir kopya alıyor; uygulama çalışırken bile güvenli.

Kullanım (proje kökünden):
    python -m scripts.backup                  # ./backups altına
    python -m scripts.backup --dir D:/yedek   # başka yere
    python -m scripts.backup --keep 14        # 14 gün sakla

Sunucuda günlük çalıştırmak için (Linux):
    0 3 * * * cd /srv/askesis && python -m scripts.backup --keep 14
"""

from __future__ import annotations

import argparse
import shutil
import sqlite3
import sys
import tarfile
import time
from datetime import datetime, timedelta
from pathlib import Path

from app.config import get_settings


def backup_sqlite(source: Path, target: Path) -> int:
    """
    Veritabanının tutarlı bir kopyasını alır.

    Dosya kopyalamak yerine SQLite'ın kendi backup API'si: uygulama yazarken
    bile bütünlüğü bozulmamış bir kopya veriyor.
    """
    if not source.exists():
        return 0

    with sqlite3.connect(source) as src, sqlite3.connect(target) as dst:
        src.backup(dst)

    return target.stat().st_size


def archive_directory(source: Path, target: Path) -> int:
    """Klasörü sıkıştırılmış arşive alır."""
    if not source.exists():
        return 0

    with tarfile.open(target, "w:gz") as tar:
        tar.add(source, arcname=source.name)

    return target.stat().st_size


def prune(backup_root: Path, keep_days: int) -> int:
    """
    Süresi dolmuş yedekleri siler.

    Sınırsız yedek tutmak diski dolduruyor ve dolu disk sunucuyu durduruyor —
    yedeklemenin kendisi arızaya dönüşmesin.
    """
    cutoff = datetime.now() - timedelta(days=keep_days)
    removed = 0

    for item in backup_root.iterdir():
        if not item.is_dir():
            continue
        try:
            stamp = datetime.strptime(item.name, "%Y-%m-%d_%H%M")
        except ValueError:
            # Bizim üretmediğimiz klasör: dokunma.
            continue
        if stamp < cutoff:
            shutil.rmtree(item, ignore_errors=True)
            removed += 1

    return removed


def human(size: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024:
            return f"{size:.0f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default="./backups", help="Yedek klasörü")
    parser.add_argument("--keep", type=int, default=7, help="Kaç gün saklansın")
    args = parser.parse_args()

    settings = get_settings()
    started = time.monotonic()

    root = Path(args.dir)
    target = root / datetime.now().strftime("%Y-%m-%d_%H%M")
    target.mkdir(parents=True, exist_ok=True)

    total = 0

    db_size = backup_sqlite(Path(settings.sqlite_path), target / "pool.db")
    total += db_size
    print(f"  pool.db     {human(db_size) if db_size else 'yok'}")

    for name, source in (
        ("chroma", Path(settings.chroma_path)),
        ("uploads", Path(settings.uploads_path)),
        ("figures", Path(settings.uploads_path).parent / "figures"),
    ):
        size = archive_directory(source, target / f"{name}.tar.gz")
        total += size
        print(f"  {name:<11} {human(size) if size else 'yok'}")

    removed = prune(root, args.keep)

    print(f"\nYedek: {target.resolve()}")
    print(f"Toplam {human(total)}, {time.monotonic() - started:.1f} saniye")
    if removed:
        print(f"{removed} eski yedek silindi ({args.keep} günden eski)")

    return 0


if __name__ == "__main__":
    sys.exit(main())