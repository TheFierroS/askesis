"""
Soru hakkı sistemi: günlük kota + kalıcı hak.

İki katman var, ikisi farklı işe yarıyor:

  daily_usage → herkesin her gün sıfırlanan kotası (DAILY_FREE_QUOTA).
                Kullanılmayan kısım devretmiyor: 10 kullanıp 40 bırakan da
                ertesi gün 50 ile başlıyor.

  credits     → admin panelinden verilen kalıcı hak. Sıfırlanmıyor, bitene
                kadar duruyor, günlük kota her gün onun ÜSTÜNE biniyor.

Tüketim sırası: önce günlük kota, o bittiğinde kalıcı hak. Sıra tersi olsaydı
verdiğin 20 hak, kullanıcı zaten bedava kotası dururken erirdi.

Örnek: 50'lik kotası biten kullanıcıya 20 verildi, 5'ini kullandı.
Ertesi gün: 50 (yeni kota) + 15 (kalan kalıcı hak) = 65.

Neden günlük?
Kota olmadan tek kullanıcı "Generate" düğmesine üst üste basarak günlük LLM
kotanı bitirip siteyi herkese kapatabilir. Günlük sıfırlanması ise kullanıcıyı
bir kereye mahsus 20 soruyla sınırlamak yerine sürekli geri getiriyor.

Neden soru başına, sınav başına değil?
Maliyet soru başına oluşuyor. Sınav başına sayarsak herkes her seferinde en
fazla soruyu ister ve maliyet katlanır.

Sıfırlama için cron yok: gün satırı yoksa kota dolu demektir. Zamanlayıcı
kurmaya ve o zamanlayıcı çökerse fark etmemeye gerek kalmıyor.
"""

from __future__ import annotations

import logging
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.config import get_settings
from app.services.pool import _connect

logger = logging.getLogger(__name__)

# Türkiye kalıcı olarak UTC+3, yaz saati uygulaması yok. zoneinfo yerine sabit
# ofset: sunucuda tzdata eksikse ZoneInfo patlar ve gün sınırı UTC'ye kayar —
# kota gece 03:00'te yenilenir, kullanıcı "bugün" derken sen "dün" dersin.
ISTANBUL = timezone(timedelta(hours=3))

SCHEMA = """
CREATE TABLE IF NOT EXISTS credits (
    user_id    TEXT PRIMARY KEY,
    -- Admin'in verdiği KALICI hak. Günlük kotadan bağımsız, sıfırlanmıyor.
    balance    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_events (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    -- Pozitif: hak verme. Negatif: harcama.
    delta      INTEGER NOT NULL,
    reason     TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credit_events_user
    ON credit_events (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS daily_usage (
    user_id TEXT NOT NULL,
    -- 'YYYY-MM-DD', Europe/Istanbul
    day     TEXT NOT NULL,
    used    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
);
"""

_schema_ready = False

# Eşzamanlı iki istek aynı gün satırına yazmaya çalışırsa koşullu UPDATE biri
# için başarısız oluyor. Yeniden okuyup denemek yeterli — gerçek trafikte
# ikinci denemeye bile düşmez.
_MAX_RETRIES = 3


@dataclass
class Allowance:
    """Kullanıcının şu an üretebileceği soru sayısının dökümü."""

    daily_limit: int
    daily_used: int
    daily_left: int
    bonus: int

    @property
    def total(self) -> int:
        """Frontend'in gösterdiği tek sayı: bugün üretilebilecek toplam."""
        return self.daily_left + self.bonus


@dataclass
class Account:
    """Admin paneli satırı."""

    user_id: str
    created_at: str
    updated_at: str
    bonus: int
    daily_limit: int
    daily_used: int
    daily_left: int
    used_total: int

    @property
    def total(self) -> int:
        return self.daily_left + self.bonus


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today() -> str:
    return datetime.now(ISTANBUL).strftime("%Y-%m-%d")


def base_quota() -> int:
    return getattr(get_settings(), "daily_free_quota", 50)


def _ensure_schema(connection: sqlite3.Connection) -> None:
    """
    Şemayı hazırlar ve gerekiyorsa mevcut veritabanını günceller.

    kind sütunu sonradan eklendi: onsuz admin'in negatif düzeltmeleri de
    "harcama" sayılıyor ve toplam üretim sayısı şişiyordu. Eski satırlar
    'usage' varsayılanını alıyor — negatif olanların hemen tamamı zaten
    üretimdi, tarihi veri makul doğrulukta kalıyor.
    """
    global _schema_ready
    if _schema_ready:
        return

    connection.executescript(SCHEMA)

    columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(credit_events)").fetchall()
    }
    if "kind" not in columns:
        connection.execute(
            "ALTER TABLE credit_events ADD COLUMN kind TEXT NOT NULL DEFAULT 'usage'"
        )
        logger.info("credit_events tablosuna kind sütunu eklendi")

    connection.commit()
    _schema_ready = True


def _log_event(
    connection: sqlite3.Connection,
    user_id: str,
    delta: int,
    reason: str,
    kind: str = "adjust",
) -> None:
    """kind: 'usage' (soru üretimi) veya 'adjust' (admin hak verme/çıkarma)."""
    connection.execute(
        "INSERT INTO credit_events (id, user_id, delta, reason, created_at, kind) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), user_id, delta, reason, _now(), kind),
    )


class _Retry(Exception):
    """
    İç kullanım: açık transaction'ı geri alıp yeniden denemek için.

    Bağlam yöneticisinden exception ile çıkmak sqlite3'te rollback tetikliyor;
    yarım kalmış bir düşme diskte kalmıyor.
    """


class InsufficientCredits(RuntimeError):
    """Kullanıcının hakkı yetmiyor."""

    def __init__(self, available: int, requested: int) -> None:
        self.available = available
        self.requested = requested
        super().__init__(f"{requested} soru istendi, {available} hak kaldı")


def ensure_account(user_id: str) -> int:
    """
    Kalıcı hak hesabını hazırlar, yoksa 0 ile açar.

    Kayıt anında değil ilk kullanımda açılıyor: Clerk'te hesap açıp hiç
    kullanmayan biri için satır tutmanın anlamı yok.

    Açılış bakiyesi 0: ücretsiz hak artık günlük kotadan geliyor, açılışta
    ayrıca vermek ikisini üst üste bindirir.
    """
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
            "VALUES (?, 0, ?, ?)",
            (user_id, now, now),
        )

    logger.info("Yeni kullanıcı: %s", user_id)
    return 0


def balance(user_id: str) -> int:
    """Yalnızca kalıcı hak. Kapı kontrolü için allowance() kullan."""
    return ensure_account(user_id)


def allowance(user_id: str) -> Allowance:
    """
    Kullanıcının şu an üretebileceği soru sayısı.

    Kapıda bunu kullan: sadece bakiyeye bakan bir kontrol, günlük kotası duran
    ama kalıcı hakkı olmayan kullanıcıyı yanlışlıkla geri çevirir.
    """
    limit = base_quota()
    bonus = ensure_account(user_id)

    with _connect() as connection:
        _ensure_schema(connection)
        row = connection.execute(
            "SELECT used FROM daily_usage WHERE user_id = ? AND day = ?",
            (user_id, _today()),
        ).fetchone()

    used = row["used"] if row else 0
    return Allowance(
        daily_limit=limit,
        daily_used=used,
        daily_left=max(0, limit - used),
        bonus=bonus,
    )


def consume(user_id: str, amount: int, reason: str = "exam") -> Allowance:
    """
    Önce günlük kotadan, yetmezse kalıcı haktan düşer.

    Yetmiyorsa InsufficientCredits fırlatır ve HİÇBİR ŞEY düşmez — kısmi düşme
    olursa kullanıcı almadığı sorunun bedelini öder.

    Günlük tarafta `used + ? <= ?` koşulu UPDATE'in içinde: önce okuyup sonra
    yazsaydık iki eşzamanlı istek aynı kotayı görüp ikisi de harcayabilirdi.
    Aynı gerekçe kalıcı taraftaki `balance >= ?` koşulu için de geçerli.
    """
    if amount <= 0:
        return allowance(user_id)

    limit = base_quota()
    day = _today()
    ensure_account(user_id)

    for _ in range(_MAX_RETRIES):
        current = allowance(user_id)

        if current.total < amount:
            raise InsufficientCredits(current.total, amount)

        from_daily = min(amount, current.daily_left)
        from_bonus = amount - from_daily

        try:
            with _connect() as connection:
                _ensure_schema(connection)

                # Gün satırını garantiye al. INSERT OR IGNORE, satır varsa
                # dokunmuyor — mevcut kullanımı sıfırlamıyor.
                connection.execute(
                    "INSERT OR IGNORE INTO daily_usage (user_id, day, used) "
                    "VALUES (?, ?, 0)",
                    (user_id, day),
                )

                if from_daily:
                    cursor = connection.execute(
                        "UPDATE daily_usage SET used = used + ? "
                        "WHERE user_id = ? AND day = ? AND used + ? <= ?",
                        (from_daily, user_id, day, from_daily, limit),
                    )
                    if cursor.rowcount == 0:
                        # Araya başka bir istek girdi, kota bu arada doldu.
                        raise _Retry()

                if from_bonus:
                    cursor = connection.execute(
                        "UPDATE credits SET balance = balance - ?, updated_at = ? "
                        "WHERE user_id = ? AND balance >= ?",
                        (from_bonus, _now(), user_id, from_bonus),
                    )
                    if cursor.rowcount == 0:
                        # Kalıcı hak bu arada eridi. Exception ile çıkmak
                        # günlük düşmeyi de geri alıyor.
                        raise _Retry()

                if from_daily:
                    _log_event(
                        connection, user_id, -from_daily, f"{reason} · kota", "usage"
                    )
                if from_bonus:
                    _log_event(
                        connection, user_id, -from_bonus, f"{reason} · hak", "usage"
                    )
        except _Retry:
            continue

        return allowance(user_id)

    # Üç denemede de yazamazsak: "yetmedi" demek yanlış olur ama sessizce soru
    # vermek de olmaz.
    raise InsufficientCredits(allowance(user_id).total, amount)


def grant(user_id: str, amount: int, reason: str = "admin grant") -> Allowance:
    """
    Kalıcı hak yükler. Negatif değer de kabul ediyor (düzeltme için).

    Bu hak SIFIRLANMIYOR: kullanıcı bitirene kadar duruyor ve günlük kota her
    gün onun üstüne biniyor.

    Bakiye eksiye düşmüyor: yanlış girilmiş bir düzeltme kullanıcıyı borçlu
    bırakmasın.
    """
    if amount == 0:
        return allowance(user_id)

    ensure_account(user_id)

    with _connect() as connection:
        _ensure_schema(connection)

        connection.execute(
            "UPDATE credits SET balance = MAX(0, balance + ?), updated_at = ? "
            "WHERE user_id = ?",
            (amount, _now(), user_id),
        )
        _log_event(connection, user_id, amount, reason, "adjust")

    result = allowance(user_id)
    logger.info(
        "Kalıcı hak: %s %+d → %d (bugün toplam %d)",
        user_id,
        amount,
        result.bonus,
        result.total,
    )
    return result


def reset_daily(user_id: str, reason: str = "admin reset") -> Allowance:
    """
    Kullanıcının bugünkü kota kullanımını sıfırlar. Kalıcı hakka dokunmuyor.

    Üretim yarıda patlayıp kota yandığında ya da "bugünlük bir daha dene"
    demek istediğinde.
    """
    day = _today()
    ensure_account(user_id)

    with _connect() as connection:
        _ensure_schema(connection)
        row = connection.execute(
            "SELECT used FROM daily_usage WHERE user_id = ? AND day = ?",
            (user_id, day),
        ).fetchone()
        used = row["used"] if row else 0

        if used:
            connection.execute(
                "UPDATE daily_usage SET used = 0 WHERE user_id = ? AND day = ?",
                (user_id, day),
            )
            _log_event(connection, user_id, used, f"{reason} (kota iadesi)", "adjust")

    logger.info("Günlük kota sıfırlandı: %s (%d iade)", user_id, used)
    return allowance(user_id)


def list_accounts(limit: int = 200) -> list[Account]:
    """
    Admin paneli için tüm kullanıcılar.

    used_total: bugüne kadar üretilen toplam soru — hem kotadan hem kalıcı
    haktan. Admin düzeltmeleri kind='adjust' olduğu için toplama girmiyor.
    """
    quota = base_quota()
    day = _today()

    with _connect() as connection:
        _ensure_schema(connection)

        rows = connection.execute(
            """
            SELECT c.user_id,
                   c.balance,
                   c.created_at,
                   c.updated_at,
                   COALESCE(d.used, 0) AS used,
                   COALESCE((
                       SELECT -SUM(delta) FROM credit_events e
                       WHERE e.user_id = c.user_id
                         AND e.delta < 0 AND e.kind = 'usage'
                   ), 0) AS used_total
            FROM credits c
            LEFT JOIN daily_usage d
                   ON d.user_id = c.user_id AND d.day = ?
            ORDER BY c.updated_at DESC
            LIMIT ?
            """,
            (day, limit),
        ).fetchall()

    return [
        Account(
            user_id=row["user_id"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            bonus=row["balance"],
            daily_limit=quota,
            daily_used=row["used"],
            daily_left=max(0, quota - row["used"]),
            used_total=row["used_total"],
        )
        for row in rows
    ]


def daily_totals(days: int = 7) -> list[dict]:
    """
    Son N günün toplam üretimi ve kaç kullanıcının ürettiği.

    "Bu iş ilgi görüyor mu" sorusunun cevabı burada. Ödeme almasan bile her gün
    birikiyor; ileride birine göstermen gerekirse hazır veri.
    """
    with _connect() as connection:
        _ensure_schema(connection)
        rows = connection.execute(
            """
            SELECT day, SUM(used) AS total, COUNT(*) AS users
            FROM daily_usage
            WHERE used > 0
            GROUP BY day
            ORDER BY day DESC
            LIMIT ?
            """,
            (days,),
        ).fetchall()

    return [
        {"day": row["day"], "questions": row["total"], "users": row["users"]}
        for row in rows
    ]