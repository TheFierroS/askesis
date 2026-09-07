"""
Soru havuzu (SQLite).

Havuzun varlık sebebi: LLM'i kullanıcının bekleme süresinden çıkarmak.
Arka plandaki worker soruları önceden üretip buraya yazıyor; kullanıcı butona
bastığında sadece SELECT çalışıyor. Kullanıcı sayısı arttıkça token maliyeti
artmıyor.

Neden SQLite, neden ORM yok?
Tek süreçte çalışan, tek makinede duran bir uygulama için SQLite fazlasıyla
yeterli — kurulum yok, sunucu yok, dosya kopyalayınca yedek alınmış oluyor.
SQLAlchemy gibi bir katman bu boyutta sadece bağımlılık ve öğrenme yükü ekler.
İleride PostgreSQL'e geçmek gerekirse tek değişecek yer bu dosya.

Üç tablo:
  questions  — onaylanmış sorular (havuzun kendisi)
  deliveries — hangi kullanıcıya hangi soru gösterildi
  solutions  — üretilmiş çözümler (aynı soru için ikinci kez üretilmesin)

deliveries ayrı bir tablo çünkü aynı soru farklı kullanıcılara gösterilebilir.
questions tablosunda "kullanıldı" diye bir bayrak tutsaydık soru tek kullanımlık
olurdu ve havuzu sürekli yeniden üretmemiz gerekirdi.
"""

from __future__ import annotations

import logging
import sqlite3
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from app.config import get_settings
from app.schemas import GeneratedQuestion
from app.services.similarity import POOL_THRESHOLD, too_similar

logger = logging.getLogger(__name__)

# Yeni soru eklerken havuzdaki kaç soruyla karşılaştırılacak.
# Tamamıyla karşılaştırmak havuz büyüdükçe yavaşlar; en yeni N tanesi
# pratikte yeterli çünkü kopyalar aynı üretim turlarından çıkıyor.
DEDUP_WINDOW = 150

SCHEMA = """
CREATE TABLE IF NOT EXISTS questions (
    id          TEXT PRIMARY KEY,
    department  TEXT NOT NULL,
    course      TEXT NOT NULL,
    exam_type   TEXT NOT NULL,
    prompt      TEXT NOT NULL,
    topic       TEXT NOT NULL DEFAULT '',
    difficulty  TEXT NOT NULL DEFAULT 'medium',
    has_figure  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
);

-- Havuzdan çekim hep (bölüm, ders, tür) üçlüsüyle filtreleniyor.
CREATE INDEX IF NOT EXISTS idx_questions_combo
    ON questions (department, course, exam_type);

CREATE TABLE IF NOT EXISTS deliveries (
    user_id      TEXT NOT NULL,
    question_id  TEXT NOT NULL,
    delivered_at TEXT NOT NULL,
    PRIMARY KEY (user_id, question_id),
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- Kullanıcının ürettiği sınavlar (geçmiş listesi).
CREATE TABLE IF NOT EXISTS exams (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    department  TEXT NOT NULL,
    course      TEXT NOT NULL,
    exam_type   TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exams_user
    ON exams (user_id, created_at DESC);

-- Sınav ile sorular arasındaki bağ. position, sorunun sınavdaki sırası.
CREATE TABLE IF NOT EXISTS exam_questions (
    exam_id     TEXT NOT NULL,
    question_id TEXT NOT NULL,
    position    INTEGER NOT NULL,
    PRIMARY KEY (exam_id, question_id),
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS solutions (
    question_id TEXT PRIMARY KEY,
    solution    TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);
"""


@dataclass
class ExamSummary:
    id: str
    department: str
    course: str
    exam_type: str
    created_at: str
    question_count: int


@dataclass
class PoolQuestion:
    id: str
    prompt: str
    topic: str
    difficulty: str
    has_figure: bool = False


def _scope(department: str, course: str) -> tuple[str, tuple]:
    """
    Havuz kapsamı: DERS ve SINAV TÜRÜ üzerinden, bölümden bağımsız.

    retrieval._filter ile aynı kural. Lineer Cebir bilgisayar, makine ve
    elektrikte aynı ders; havuzu bölüm bölüm ayırmak aynı soruları üç kez
    üretmek ve üç zayıf havuz beslemek demekti.

    `department` imzada duruyor: çağrı yerlerini değiştirmemek ve ileride
    ayrıştırmak gerekirse tek yerden geri açabilmek için. Ayrıştırmanın doğru
    yolu ders adını farklılaştırmak — "Physics I (EE)" gibi.
    """
    return "course = ?", (course,)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# Şemanın bu süreçte oluşturulup oluşturulmadığı.
# Her bağlantıda executescript çalıştırmak gereksiz; bir kez yeterli.
_schema_ready = False


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    """
    Bağlantıyı açar, işi bitince kapatır, hata olursa geri alır.

    row_factory: satırlara sütun adıyla erişmek için (row["prompt"] gibi),
    indeksle erişim kolay kırılıyor.
    """
    settings = get_settings()
    path = Path(settings.sqlite_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    # timeout: dosya kilitliyse hemen hata vermek yerine bu kadar saniye bekle.
    # API ve worker iki ayrı süreç olduğu için bu şart.
    connection = sqlite3.connect(path, timeout=30.0)
    connection.row_factory = sqlite3.Row

    # Yabancı anahtar kısıtları SQLite'ta varsayılan olarak KAPALI.
    connection.execute("PRAGMA foreign_keys = ON")

    # WAL (Write-Ahead Logging): okuyucular yazarı, yazar okuyucuları
    # engellemiyor. Varsayılan modda worker havuza yazarken gelen kullanıcı
    # isteği "database is locked" alırdı. Ayar dosyada kalıcı, her açılışta
    # tekrar yazmak zararsız.
    connection.execute("PRAGMA journal_mode = WAL")

    # NORMAL: her yazmada diske fsync yapma, checkpoint'te yap. Elektrik
    # kesintisinde son birkaç işlem kaybedilebilir — havuzdaki birkaç soru
    # için kabul edilebilir bir risk, karşılığında yazma çok daha hızlı.
    connection.execute("PRAGMA synchronous = NORMAL")

    # Yazma kilidini beklerken meşgul döngüsü yerine gerçekten bekle.
    connection.execute("PRAGMA busy_timeout = 30000")

    # Şemayı bağlantı açılırken garanti ediyoruz.
    #
    # Neden: init_db() yalnızca FastAPI açılışında çağrılıyordu. Worker'ı ya da
    # bir script'i doğrudan çalıştırınca (veya veritabanı dosyası silinince)
    # "no such table: questions" hatası alınıyordu. Tabloların varlığı
    # uygulamanın nasıl başlatıldığına bağlı olmamalı.
    global _schema_ready
    if not _schema_ready:
        connection.executescript(SCHEMA)

        # Şekil desteği sonradan geldi; var olan veritabanlarında sütun yok.
        # CREATE TABLE IF NOT EXISTS eski tabloyu güncellemiyor, sütunu elle
        # ekliyoruz. Zaten varsa SQLite hata veriyor, onu yutuyoruz.
        try:
            connection.execute(
                "ALTER TABLE questions ADD COLUMN has_figure INTEGER NOT NULL DEFAULT 0"
            )
        except sqlite3.OperationalError:
            pass

        connection.commit()
        _schema_ready = True

    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def init_db() -> None:
    """
    Tabloları oluşturur.

    _connect() bunu zaten yapıyor; bu fonksiyon açılışta bir kez çağrılıp
    veritabanının erişilebilir olduğunu doğrulamak ve log'a düşmek için var.
    """
    with _connect():
        pass
    logger.info("Havuz veritabanı hazır: %s", get_settings().sqlite_path)


# ------------------------------------------------------------------ yazma


def add_questions(
    questions: list[GeneratedQuestion],
    *,
    department: str,
    course: str,
    exam_type: str,
) -> list[str]:
    """
    Onaylanmış soruları havuza ekler. Havuzda zaten benzeri olanları atar.

    Dönen: eklenen soruların id listesi. Sayı değil id döndürüyoruz çünkü
    çağıran taraf (API) tam olarak bu soruları kullanıcıya vermek istiyor;
    havuzdan tekrar rastgele çekerse yeni eklenenler yerine eskileri gelebilir.

    Parti içi kopya kontrolünü generator yapıyor; buradaki kontrol farklı bir
    şeyi kapatıyor: farklı turlarda üretilmiş ama birbirine benzeyen sorular.
    Aynı 5 referanstan defalarca üretim yapınca bu kaçınılmaz oluyor.
    """
    if not questions:
        return []

    scope_sql, scope_args = _scope(department, course)

    with _connect() as connection:
        existing = [
            row["prompt"]
            for row in connection.execute(
                f"""
                SELECT prompt FROM questions
                WHERE {scope_sql} AND exam_type = ?
                ORDER BY created_at DESC LIMIT ?
                """,
                (*scope_args, exam_type, DEDUP_WINDOW),
            )
        ]

        rows: list[tuple] = []
        inserted_ids: list[str] = []
        for question in questions:
            if any(
                too_similar(
                    question.prompt, old, POOL_THRESHOLD, check_numbers=True
                )
                for old in existing
            ):
                logger.info("Havuzda benzeri var, atlandı: %s", question.topic)
                continue
            # Kabul edilen soruyu da listeye ekliyoruz ki aynı partideki
            # sonraki sorular ona karşı da kontrol edilsin.
            existing.append(question.prompt)
            new_id = str(uuid.uuid4())
            inserted_ids.append(new_id)
            rows.append(
                (
                    new_id,
                    department,
                    course,
                    exam_type,
                    question.prompt,
                    question.topic,
                    question.difficulty,
                    _now(),
                )
            )

        connection.executemany(
            """
            INSERT INTO questions
                (id, department, course, exam_type, prompt, topic, difficulty, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )

    logger.info("Havuza %d soru eklendi (%s/%s)", len(rows), course, exam_type)
    return inserted_ids


def delete_questions(question_ids: list[str]) -> int:
    """
    Havuzdan soru siler.

    Şekli çizilemeyen ve metni şekle atıfta bulunan sorular için: o soru
    cevaplanamaz durumda, havuzda tutmanın anlamı yok.
    """
    if not question_ids:
        return 0

    placeholders = ",".join("?" for _ in question_ids)
    with _connect() as connection:
        cursor = connection.execute(
            f"DELETE FROM questions WHERE id IN ({placeholders})", question_ids
        )
        return cursor.rowcount


def mark_has_figure(question_id: str) -> None:
    """Şekil üretilip kaydedildikten sonra çağrılıyor."""
    with _connect() as connection:
        connection.execute(
            "UPDATE questions SET has_figure = 1 WHERE id = ?", (question_id,)
        )


def save_solution(question_id: str, solution: str) -> None:
    """Çözümü saklar. Aynı soru ikinci kez sorulduğunda LLM'e gitmiyoruz."""
    with _connect() as connection:
        connection.execute(
            "INSERT OR REPLACE INTO solutions (question_id, solution, created_at) "
            "VALUES (?, ?, ?)",
            (question_id, solution, _now()),
        )


# ------------------------------------------------------------------ okuma


def take_questions(
    *,
    user_id: str,
    department: str,
    course: str,
    exam_type: str,
    count: int,
) -> list[PoolQuestion]:
    """
    Kullanıcıya daha önce gösterilmemiş sorulardan `count` tane verir ve
    gösterildi olarak işaretler.

    NOT EXISTS alt sorgusu: bu kullanıcıya daha önce teslim edilmiş soruları
    eliyor. Aynı soru başka kullanıcıya gösterilmiş olabilir, o önemli değil.

    ORDER BY RANDOM(): havuzdan hep aynı sırayla çekmemek için. Havuz büyükse
    bu yavaşlayabilir; o noktaya gelirsek rastgele bir eşikten sonrasını almak
    gibi bir numaraya geçeriz.
    """
    scope_sql, scope_args = _scope(department, course)

    with _connect() as connection:
        # Konu çeşitliliği: her konudan önce BİR soru, sonra ikinciler.
        #
        # Gerçek bir sınav kağıdı farklı konuları ölçer; art arda iki türev
        # sorusu görmek hem sıkıcı hem öğretici değil. Havuz büyüdükçe aynı
        # konudan çok soru birikiyor ve rastgele seçim aynı konuyu üst üste
        # getirebiliyordu.
        #
        # ROW_NUMBER ... PARTITION BY topic her konuyu kendi içinde
        # numaralandırıyor; `ORDER BY rn` önce her konunun ilk sorusunu
        # veriyor. Konu sayısı istenen soru sayısından azsa ikinci turdan
        # devam ediyor — eksik dönmek yerine tekrar eden konu daha iyi.
        rows = connection.execute(
            f"""
            SELECT id, prompt, topic, difficulty, has_figure
            FROM (
                SELECT q.id, q.prompt, q.topic, q.difficulty, q.has_figure,
                       ROW_NUMBER() OVER (
                           PARTITION BY LOWER(TRIM(q.topic))
                           ORDER BY RANDOM()
                       ) AS rn
                FROM questions q
                WHERE {scope_sql} AND exam_type = ?
                  AND NOT EXISTS (
                      SELECT 1 FROM deliveries d
                      WHERE d.question_id = q.id AND d.user_id = ?
                  )
            )
            ORDER BY rn, RANDOM()
            LIMIT ?
            """,
            (*scope_args, exam_type, user_id, count),
        ).fetchall()

        if rows:
            connection.executemany(
                "INSERT OR IGNORE INTO deliveries (user_id, question_id, delivered_at) "
                "VALUES (?, ?, ?)",
                [(user_id, row["id"], _now()) for row in rows],
            )

    return [
        PoolQuestion(
            id=row["id"],
            prompt=row["prompt"],
            topic=row["topic"],
            difficulty=row["difficulty"],
            has_figure=bool(row["has_figure"]),
        )
        for row in rows
    ]


def take_by_ids(user_id: str, question_ids: list[str]) -> list[PoolQuestion]:
    """
    Belirli soruları kullanıcıya verir ve teslim edildi olarak işaretler.

    take_questions rastgele seçiyor; bu ise "az önce ürettiklerimizi ver"
    demek için. İkisi ayrı çünkü anlık üretimde kullanıcı beklerken üretilen
    soruların kendisine gitmesi gerekiyor, havuzdaki başka bir sorunun değil.
    """
    if not question_ids:
        return []

    placeholders = ",".join("?" for _ in question_ids)

    with _connect() as connection:
        rows = connection.execute(
            f"SELECT id, prompt, topic, difficulty, has_figure FROM questions WHERE id IN ({placeholders})",
            question_ids,
        ).fetchall()

        if rows:
            connection.executemany(
                "INSERT OR IGNORE INTO deliveries (user_id, question_id, delivered_at) "
                "VALUES (?, ?, ?)",
                [(user_id, row["id"], _now()) for row in rows],
            )

    return [
        PoolQuestion(
            id=row["id"],
            prompt=row["prompt"],
            topic=row["topic"],
            difficulty=row["difficulty"],
            has_figure=bool(row["has_figure"]),
        )
        for row in rows
    ]


def get_questions(question_ids: list[str]) -> list[PoolQuestion]:
    """
    Soruları id'leriyle getirir — teslimat işaretlemeden.

    take_by_ids'ten farkı bu: PDF üretirken kullanıcı soruları zaten görmüş
    oluyor, ikinci kez "teslim edildi" yazmanın anlamı yok.

    Dönen liste, verilen id sırasını koruyor. SQL IN(...) sırayı garanti
    etmiyor ve PDF'te soruların ekrandaki sırayla çıkması gerekiyor.
    """
    if not question_ids:
        return []

    placeholders = ",".join("?" for _ in question_ids)

    with _connect() as connection:
        rows = connection.execute(
            f"SELECT id, prompt, topic, difficulty, has_figure FROM questions "
            f"WHERE id IN ({placeholders})",
            question_ids,
        ).fetchall()

    by_id = {
        row["id"]: PoolQuestion(
            id=row["id"],
            prompt=row["prompt"],
            topic=row["topic"],
            difficulty=row["difficulty"],
            has_figure=bool(row["has_figure"]),
        )
        for row in rows
    }
    return [by_id[qid] for qid in question_ids if qid in by_id]


# ------------------------------------------------------------------ sınav geçmişi


def save_exam(
    *,
    user_id: str,
    department: str,
    course: str,
    exam_type: str,
    question_ids: list[str],
) -> str:
    """
    Üretilen sınavı kullanıcının geçmişine yazar.

    Soruların kendisini kopyalamıyoruz, sadece id'lerini bağlıyoruz. Aynı soru
    birçok kullanıcının sınavında yer alabiliyor; metni tekrar tekrar saklamak
    veritabanını gereksiz şişirirdi.
    """
    exam_id = str(uuid.uuid4())

    with _connect() as connection:
        connection.execute(
            "INSERT INTO exams (id, user_id, department, course, exam_type, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (exam_id, user_id, department, course, exam_type, _now()),
        )
        connection.executemany(
            "INSERT INTO exam_questions (exam_id, question_id, position) VALUES (?, ?, ?)",
            [(exam_id, qid, index) for index, qid in enumerate(question_ids)],
        )

    return exam_id


def list_exams(user_id: str, limit: int = 50) -> list[ExamSummary]:
    """Kullanıcının sınav geçmişi, en yeniden eskiye."""
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT e.id, e.department, e.course, e.exam_type, e.created_at,
                   COUNT(eq.question_id) AS question_count
            FROM exams e
            LEFT JOIN exam_questions eq ON eq.exam_id = e.id
            WHERE e.user_id = ?
            GROUP BY e.id
            ORDER BY e.created_at DESC
            LIMIT ?
            """,
            (user_id, limit),
        ).fetchall()

    return [
        ExamSummary(
            id=row["id"],
            department=row["department"],
            course=row["course"],
            exam_type=row["exam_type"],
            created_at=row["created_at"],
            question_count=row["question_count"],
        )
        for row in rows
    ]


def get_exam(user_id: str, exam_id: str) -> tuple[ExamSummary, list[PoolQuestion]] | None:
    """
    Bir sınavı ve sorularını getirir.

    user_id koşulu şart: id'yi bilen birinin başkasının sınavını açabilmesini
    engelliyor. Kayıt bulunamazsa None — çağıran taraf 404 döndürüyor, "yetkin
    yok" demiyoruz ki sınavın varlığı bile sızmasın.
    """
    with _connect() as connection:
        exam = connection.execute(
            "SELECT id, department, course, exam_type, created_at FROM exams "
            "WHERE id = ? AND user_id = ?",
            (exam_id, user_id),
        ).fetchone()

        if not exam:
            return None

        rows = connection.execute(
            """
            SELECT q.id, q.prompt, q.topic, q.difficulty, q.has_figure
            FROM exam_questions eq
            JOIN questions q ON q.id = eq.question_id
            WHERE eq.exam_id = ?
            ORDER BY eq.position
            """,
            (exam_id,),
        ).fetchall()

    questions = [
        PoolQuestion(
            id=row["id"],
            prompt=row["prompt"],
            topic=row["topic"],
            difficulty=row["difficulty"],
            has_figure=bool(row["has_figure"]),
        )
        for row in rows
    ]

    summary = ExamSummary(
        id=exam["id"],
        department=exam["department"],
        course=exam["course"],
        exam_type=exam["exam_type"],
        created_at=exam["created_at"],
        question_count=len(questions),
    )
    return summary, questions


def delete_exam(user_id: str, exam_id: str) -> bool:
    """
    Sınavı geçmişten kalıcı olarak siler.

    Sorular havuzda KALIYOR ve kullanıcıya bir daha gösterilmiyor.
    Sınavı silmek "bu soruları görmedim" demek değil, sadece listeden
    kaldırmak. Teslimat kaydını da silseydik öğrenci aynı soruyu yeni sanıp
    tekrar çözerdi.

    exam_questions satırları ON DELETE CASCADE ile kendiliğinden gidiyor.
    """
    with _connect() as connection:
        cursor = connection.execute(
            "DELETE FROM exams WHERE id = ? AND user_id = ?", (exam_id, user_id)
        )
        return cursor.rowcount > 0


def get_solution(question_id: str) -> str | None:
    with _connect() as connection:
        row = connection.execute(
            "SELECT solution FROM solutions WHERE question_id = ?",
            (question_id,),
        ).fetchone()
    return row["solution"] if row else None


def get_question(question_id: str) -> PoolQuestion | None:
    with _connect() as connection:
        row = connection.execute(
            "SELECT id, prompt, topic, difficulty, has_figure FROM questions WHERE id = ?",
            (question_id,),
        ).fetchone()
    if not row:
        return None
    return PoolQuestion(
        id=row["id"],
        prompt=row["prompt"],
        topic=row["topic"],
        difficulty=row["difficulty"],
        has_figure=bool(row["has_figure"]),
    )


# ------------------------------------------------------------------ havuz sağlığı


def pool_size(department: str, course: str, exam_type: str) -> int:
    """
    Havuz büyüklüğü — DERS bazında, bölümden bağımsız.

    Referanslar ders bazında paylaşıldığı için havuz da öyle: Lineer Cebir
    sorusu hangi bölümden üretilmiş olursa olsun o dersi alan herkese açık.
    `department` yalnızca kayıt için tutuluyor.
    """
    scope_sql, scope_args = _scope(department, course)

    with _connect() as connection:
        row = connection.execute(
            f"SELECT COUNT(*) AS n FROM questions WHERE {scope_sql} AND exam_type = ?",
            (*scope_args, exam_type),
        ).fetchone()
    return row["n"]


def available_for_user(
    user_id: str, department: str, course: str, exam_type: str
) -> int:
    """Bu kullanıcının henüz görmediği soru sayısı."""
    scope_sql, scope_args = _scope(department, course)

    with _connect() as connection:
        row = connection.execute(
            f"""
            SELECT COUNT(*) AS n FROM questions q
            WHERE {scope_sql} AND exam_type = ?
              AND NOT EXISTS (
                  SELECT 1 FROM deliveries d
                  WHERE d.question_id = q.id AND d.user_id = ?
              )
            """,
            (*scope_args, exam_type, user_id),
        ).fetchone()
    return row["n"]


def combos_below_threshold(threshold: int | None = None) -> list[tuple[str, str, str]]:
    """
    Havuzu eşiğin altına düşmüş kombinasyonları döndürür.

    Worker bunu dolaşıp üretim yapacak. Dikkat: burada sadece havuzda **var
    olan** kombinasyonlar görünüyor. Hiç sorusu olmayan yeni bir ders için
    referans tarafına (retrieval.available_combinations) bakmak gerekiyor —
    worker ikisini birleştiriyor.
    """
    limit = threshold if threshold is not None else get_settings().pool_min_size

    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT department, course, exam_type, COUNT(*) AS n
            FROM questions
            GROUP BY department, course, exam_type
            HAVING n < ?
            """,
            (limit,),
        ).fetchall()

    return [(r["department"], r["course"], r["exam_type"]) for r in rows]


def stats() -> list[dict]:
    """Admin paneli için: kombinasyon başına havuz durumu."""
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT department, course, exam_type,
                   COUNT(*) AS total,
                   MIN(created_at) AS oldest,
                   MAX(created_at) AS newest
            FROM questions
            GROUP BY department, course, exam_type
            ORDER BY department, course, exam_type
            """
        ).fetchall()
    return [dict(row) for row in rows]


def known_topics(department: str, course: str, exam_type: str) -> list[str]:
    """
    Bu kombinasyonda kullanımda olan konu etiketleri, sık kullanılandan aza.

    Üretim promptuna veriliyor: model her partide aynı kavrama yeni bir ad
    uydurunca ("matrix inverse", "matrix inversion", "matrix invertibility")
    konu dağılımı parçalanıyor ve sayılamaz hale geliyor. Mevcut sözlüğü
    göstermek modeli var olanı yeniden kullanmaya yöneltiyor.

    Aynı fikir yükleme yolunda zaten vardı (labeling.known_topics); üretim
    yolunda yoktu.

    Sık kullanılanlar başta: liste kırpıldığında elenecek olanlar, dersi en az
    temsil eden etiketler olsun.
    """
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT topic, COUNT(*) AS n
            FROM questions
            WHERE department = ? AND course = ? AND exam_type = ?
              AND topic != ''
            GROUP BY topic
            ORDER BY n DESC
            """,
            (department, course, exam_type),
        ).fetchall()

    return [row["topic"] for row in rows]


def topic_breakdown(
    department: str, course: str, exam_type: str, limit: int = 12
) -> list[dict]:
    """
    Konu dağılımı: hangi konudan kaç soru var, çoktan aza.

    Herkese açık ders sayfasında gösteriliyor. "Bu dersin vizesinde en çok ne
    çıkıyor" sorusunun cevabı — öğrencinin aradığı şey bu.

    Liste kırpılıyor: uzun kuyrukta aynı kavramın tek soruluk varyasyonları
    birikiyor ("basis change", "basis transition", "basis change in P1") ve
    sayfayı okunmaz hale getiriyor. Üstteki bir düzine konu dersi zaten
    temsil ediyor.
    """
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT topic, COUNT(*) AS n
            FROM questions
            WHERE department = ? AND course = ? AND exam_type = ?
              AND topic != ''
            GROUP BY topic
            ORDER BY n DESC, topic
            LIMIT ?
            """,
            (department, course, exam_type, limit),
        ).fetchall()

    return [{"topic": row["topic"], "count": row["n"]} for row in rows]


def sample_questions(
    department: str, course: str, exam_type: str, limit: int = 5
) -> list[dict]:
    """
    Herkese açık sayfada gösterilecek örnek sorular.

    Teslimat kaydı tutmuyor: bunlar kimseye "verilmiş" sayılmıyor, yalnızca
    vitrin. Aynı sorular herkese görünüyor ve kredi düşmüyor.

    Şekilli sorular alınmıyor — sayfada şekil gösterme yolu yok ve şekle atıf
    yapan bir soru şekilsiz anlamsız kalıyor.
    """
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT id, prompt, topic, difficulty
            FROM questions
            WHERE department = ? AND course = ? AND exam_type = ?
              AND has_figure = 0
            ORDER BY created_at
            LIMIT ?
            """,
            (department, course, exam_type, limit),
        ).fetchall()

    return [dict(row) for row in rows]