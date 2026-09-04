"""
Soru hakkı (kredi) sistemi.

Neden gerekli?
Kota olmadan tek bir kullanıcı "Generate" düğmesine üst üste basarak günlük LLM
kotanı bitirebilir ve site herkese kapanır. Kredi hem bu istismarı engelliyor
hem de ileride satılacak paketlerin altyapısı oluyor — iki ayrı mekanizma
kurmak yerine tek kavram.

Neden soru başına, sınav başına değil?
Maliyet soru başına oluşuyor. Sınav başına ücretlendirirsek herkes her seferinde
en fazla soruyu ister ve maliyet katlanır; soru başına olunca kullanıcı üç
soruluk küçük setlerle idareli kullanabiliyor.

İki tablo var, ikisi de gerekli:
  credits        → güncel bakiye (hızlı okuma)
  credit_events  → her hareketin kaydı (denetim izi)

Sadece bakiye tutmak yeterli görünüyor ama "param gitti hakkım gelmedi"
denildiğinde bakacak bir yer olmuyor. Ödeme entegrasyonu geldiğinde bu tablo
zorunlu hale gelecek.
"""

from __future__ import annotations

import logging
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from app.config import get_settings
from app.services.pool import _connect

logger = logging.getLogger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS credits (
    user_id    TEXT PRIMARY KEY,
    balance    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_events (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    -- Pozitif: yükleme/hediye. Negatif: harcama.
    delta      INTEGER NOT NULL,
    reason     TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credit_events_user
    ON credit_events (user_id, created_at DESC);
"""

_schema_ready = False


@dataclass
class Balance:
    user_id: str
    balance: int
    created_at: str
    updated_at: str
    used_total: int


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_schema(connection: sqlite3.Connection) -> None:
    global _schema_ready
    if not _schema_ready:
        connection.executescript(SCHEMA)
        connection.commit()
        _schema_ready = True


class InsufficientCredits(RuntimeError):
    """Kullanıcının hakkı yetmiyor."""

    def __init__(self, available: int, requested: int) -> None:
        self.available = available
        self.requested = requested
        super().__init__(f"{requested} soru istendi, {available} hak kaldı")


def ensure_account(user_id: str) -> int:
    """
    Kullanıcının hesabını hazırlar, yoksa ücretsiz hakla açar.

    Kayıt anında değil ilk kullanımda açılıyor: Clerk'te hesap açıp hiç
    kullanmayan biri için satır tutmanın anlamı yok.
    """
    settings = get_settings()

    with _connect() as connection:
        _ensure_schema(connection)

        row = connection.execute(
            "SELECT balance FROM credits WHERE user_id = ?", (user_id,)
        ).fetchone()

        if row:
            return row["balance"]

        now = _now()
        connection.execute(
            "INSERT INTO credits (user_id, balance, created_at, updated_at) "
            "VALUES (?, ?, ?, ?)",
            (user_id, settings.free_credits, now, now),
        )
        connection.execute(
            "INSERT INTO credit_events (id, user_id, delta, reason, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), user_id, settings.free_credits, "signup bonus", now),
        )

    logger.info("Yeni kredi hesabı: %s (%d hak)", user_id, settings.free_credits)
    return settings.free_credits


def balance(user_id: str) -> int:
    return ensure_account(user_id)


def consume(user_id: str, amount: int, reason: str = "exam") -> int:
    """
    Bakiyeden düşer. Yetmiyorsa InsufficientCredits fırlatır.

    Tek bir UPDATE ile ve `balance >= ?` koşuluyla düşüyoruz. Önce okuyup sonra
    yazsaydık iki eşzamanlı istek aynı bakiyeyi görüp ikisi de harcayabilirdi
    (yarış durumu). Koşulu SQL'e koymak bunu imkânsız kılıyor.
    """
    if amount <= 0:
        return balance(user_id)

    current = ensure_account(user_id)

    with _connect() as connection:
        _ensure_schema(connection)

        cursor = connection.execute(
            "UPDATE credits SET balance = balance - ?, updated_at = ? "
            "WHERE user_id = ? AND balance >= ?",
            (amount, _now(), user_id, amount),
        )

        if cursor.rowcount == 0:
            raise InsufficientCredits(current, amount)

        connection.execute(
            "INSERT INTO credit_events (id, user_id, delta, reason, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), user_id, -amount, reason, _now()),
        )

        row = connection.execute(
            "SELECT balance FROM credits WHERE user_id = ?", (user_id,)
        ).fetchone()

    return row["balance"]


def grant(user_id: str, amount: int, reason: str = "admin grant") -> int:
    """
    Hak yükler. Negatif değer de kabul ediyor (düzeltme için).

    Bakiyeyi eksiye düşürmüyoruz: yanlış girilmiş bir düzeltme kullanıcıyı
    borçlu bırakmasın.
    """
    ensure_account(user_id)

    with _connect() as connection:
        _ensure_schema(connection)

        connection.execute(
            "UPDATE credits SET balance = MAX(0, balance + ?), updated_at = ? "
            "WHERE user_id = ?",
            (amount, _now(), user_id),
        )
        connection.execute(
            "INSERT INTO credit_events (id, user_id, delta, reason, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), user_id, amount, reason, _now()),
        )

        row = connection.execute(
            "SELECT balance FROM credits WHERE user_id = ?", (user_id,)
        ).fetchone()

    logger.info("Kredi yüklendi: %s %+d → %d", user_id, amount, row["balance"])
    return row["balance"]


def list_accounts(limit: int = 200) -> list[Balance]:
    """
    Admin paneli için tüm hesaplar.

    used_total: bugüne kadar harcanan toplam. Bakiyeden farklı — kullanıcının
    siteyi ne kadar kullandığını bakiyeye bakarak anlayamıyoruz, çünkü sonradan
    hak yüklenmiş olabilir.
    """
    with _connect() as connection:
        _ensure_schema(connection)

        rows = connection.execute(
            """
            SELECT c.user_id, c.balance, c.created_at, c.updated_at,
                   COALESCE(-SUM(CASE WHEN e.delta < 0 THEN e.delta END), 0) AS used_total
            FROM credits c
            LEFT JOIN credit_events e ON e.user_id = c.user_id
            GROUP BY c.user_id
            ORDER BY c.updated_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    return [
        Balance(
            user_id=row["user_id"],
            balance=row["balance"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            used_total=row["used_total"],
        )
        for row in rows
    ]
