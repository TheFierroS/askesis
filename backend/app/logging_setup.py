"""
Log yapılandırması.

NEDEN DOSYAYA
Şimdiye kadar loglar yalnızca terminale basıyordu. Geliştirirken yeterli ama
sunucuda değil: süreç yeniden başladığında geçmiş kayboluyor ve bir kullanıcı
"dün akşam soru üretemedim" dediğinde bakacak yer kalmıyor. Hata ayıklamak
için gereken bilgi, hatanın olduğu an yakalanmalı.

DÖNDÜRME (rotation)
Tek bir dosyaya sınırsız yazmak diski doldurur. Dosya belli boyuta ulaşınca
yeni dosyaya geçiliyor, eskiler numaralanıp saklanıyor, en eskisi siliniyor.

İKİ DOSYA
  app.log    → her şey (INFO ve üstü)
  error.log  → yalnızca hatalar

İkincisi olmasa da olurdu ama bir sorunu incelerken binlerce satır INFO
arasında WARNING aramak zaman kaybı. Hata dosyası genelde birkaç satır ve
doğrudan soruna bakıyor.
"""

from __future__ import annotations

import logging
import logging.handlers
import sys
from pathlib import Path

# Dosya başına üst sınır ve saklanacak eski dosya sayısı.
MAX_BYTES = 5 * 1024 * 1024  # 5 MB
BACKUP_COUNT = 5

FORMAT = "%(asctime)s %(levelname)-7s %(name)s: %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

# Gürültülü kütüphaneler. httpx her istek için satır basıyor; bizim kendi
# log'umuz zaten hangi sağlayıcının yanıt verdiğini yazıyor.
NOISY_LOGGERS = {
    "httpx": logging.WARNING,
    "httpcore": logging.WARNING,
    "apscheduler.executors.default": logging.WARNING,
    "chromadb": logging.WARNING,
    "urllib3": logging.WARNING,
}


def setup_logging(log_dir: str = "./logs", level: int = logging.INFO) -> None:
    """
    Kök logger'ı yapılandırır: konsol + dosya.

    Uygulama açılışında bir kez çağrılıyor. İkinci çağrıda mevcut handler'lar
    temizleniyor; `--reload` ile geliştirirken her yeniden yüklemede handler
    ekleyip aynı satırı iki kez yazmayı önlüyor.
    """
    path = Path(log_dir)
    path.mkdir(parents=True, exist_ok=True)

    formatter = logging.Formatter(FORMAT, datefmt=DATE_FORMAT)
    root = logging.getLogger()
    root.setLevel(level)

    for handler in root.handlers[:]:
        root.removeHandler(handler)
        handler.close()

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(formatter)
    root.addHandler(console)

    app_file = logging.handlers.RotatingFileHandler(
        path / "app.log",
        maxBytes=MAX_BYTES,
        backupCount=BACKUP_COUNT,
        encoding="utf-8",
    )
    app_file.setFormatter(formatter)
    root.addHandler(app_file)

    error_file = logging.handlers.RotatingFileHandler(
        path / "error.log",
        maxBytes=MAX_BYTES,
        backupCount=BACKUP_COUNT,
        encoding="utf-8",
    )
    error_file.setLevel(logging.WARNING)
    error_file.setFormatter(formatter)
    root.addHandler(error_file)

    for name, noisy_level in NOISY_LOGGERS.items():
        logging.getLogger(name).setLevel(noisy_level)

    logging.getLogger(__name__).info("Log dosyaları: %s", path.resolve())