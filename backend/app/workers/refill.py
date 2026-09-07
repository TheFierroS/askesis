"""
Havuz doldurma worker'ı.

Mimarinin can damarı burası: LLM çağrıları kullanıcının isteğinde değil,
burada oluyor. Kullanıcı butona bastığında sadece SELECT çalışıyor.

İki ayrı kaynaktan iş listesi çıkarıyoruz:
  1. Havuzda kaydı olan ama eşiğin altına düşmüş kombinasyonlar (pool)
  2. Referansı olan ama havuzda hiç sorusu olmayan kombinasyonlar (retrieval)

İkincisi kritik: yeni bir ders yüklendiğinde havuz tablosunda o dersin hiç
satırı yok, yani `combos_below_threshold` onu göremiyor.

Her turda neden tek kombinasyon işleniyor?
Groq'un dakikalık token limiti dar. Bütün dersleri arka arkaya işlemeye
kalksak ilk birkaçında 429 yiyip zincirdeki bütün sağlayıcıları soğutmaya
alırdık. Turda bir kombinasyon + sık aralık, yükü güne yayıyor — havuz
mimarisinin asıl kazancı da buydu.
"""

from __future__ import annotations

import logging
import random
import time
from datetime import datetime, timedelta, timezone

from app.config import get_settings
from app.services import figures, generator, pool, retrieval

logger = logging.getLogger(__name__)

Combo = tuple[str, str, str]

# Bir kombinasyon boş tur verdiğinde ne kadar dinlendirileceği.
#
# Neden gerekli:
# Havuzun çeşitliliği referans sayısına bağlı. 10 referans sorusundan bir yere
# kadar farklı soru üretilebiliyor; o sınıra gelince üretilen her şey kopya
# filtresine takılıyor ve tur boş dönüyor. Worker bunu bilmezse her 10 dakikada
# bir aynı duvara toslayıp token yakıyor.
#
# Üstel geri çekilme: 1 boş tur → 1 tur atla, 2 → 2, 3 → 4, 4 → 8...
# Üst sınır var, yoksa yeni sınav yüklendiğinde saatlerce fark edilmiyor.
MAX_BACKOFF_ROUNDS = 12

# Boş tur sayacı ve "şu ana kadar atla" damgası.
# Bellekte tutmak yeterli: worker yeniden başladığında sıfırlanması istenen
# davranış — belki de bu arada yeni sınav yüklenmiştir.
_empty_rounds: dict[Combo, int] = {}
_skip_until: dict[Combo, float] = {}


def _round_seconds() -> float:
    return get_settings().refill_interval_minutes * 60


def _is_resting(combo: Combo) -> bool:
    return time.monotonic() < _skip_until.get(combo, 0.0)


def _mark_empty(combo: Combo) -> None:
    """
    Boş tur: sayacı artır, tolerans dolduysa dinlendirmeye al.

    İlk boş turlarda geri çekilmiyoruz. Referanslar her turda rastgele
    seçildiği için bir tur boş dönmesi havuzun doyduğu anlamına gelmiyor —
    o tur şanssız bir üçlü gelmiş olabilir, sonraki tur farklı referanslarla
    pekâlâ yeni soru üretebilir.
    """
    count = _empty_rounds.get(combo, 0) + 1
    _empty_rounds[combo] = count

    grace = get_settings().refill_grace_rounds
    if count <= grace:
        logger.info(
            "%s/%s: yeni soru çıkmadı (%d/%d), tolerans içinde, devam",
            combo[1],
            combo[2],
            count,
            grace,
        )
        return

    rounds = min(2 ** (count - grace - 1), MAX_BACKOFF_ROUNDS)
    _skip_until[combo] = time.monotonic() + rounds * _round_seconds()

    logger.info(
        "%s/%s: yeni soru çıkmadı (%d. kez), %d tur dinlendiriliyor",
        combo[1],
        combo[2],
        count,
        rounds,
    )


def _mark_success(combo: Combo) -> None:
    _empty_rounds.pop(combo, None)
    _skip_until.pop(combo, None)


def reset_backoff() -> None:
    """
    Geri çekilmeyi sıfırlar.

    Yeni sınav yüklendiğinde çağrılıyor: referanslar genişlediği için daha önce
    doymuş bir kombinasyon artık yeni soru üretebilir, dinlenmesini beklemenin
    anlamı yok.
    """
    _empty_rounds.clear()
    _skip_until.clear()


def pending_combos() -> list[Combo]:
    """Havuzu eşiğin altında olan (bölüm, ders, tür) üçlüleri."""
    settings = get_settings()
    threshold = settings.pool_min_size

    # Referansı olan her kombinasyon aday.
    candidates: set[Combo] = {
        (c["department"], c["course"], c["exam_type"])
        for c in retrieval.available_combinations()
    }

    # threshold <= 0: sınırsız mod. Havuz büyüklüğüne bakmadan üretmeye devam
    # ediyoruz; duracağı tek yer, yeni soru çıkmayıp geri çekilmeye girdiği an.
    unlimited = threshold <= 0

    pending = [
        combo
        for combo in candidates
        if (unlimited or pool.pool_size(*combo) < threshold)
        and not _is_resting(combo)
    ]

    # Sıralamayı karıştırıyoruz: aynı sırada gidersek listenin sonundaki ders
    # hiç doldurulmaz (üsttekiler sürekli tüketiliyorsa).
    random.shuffle(pending)
    return pending


def refill_once() -> int:
    """
    Bir tur çalışır: eşiğin altındaki bir kombinasyona soru üretir.

    Dönen: havuza eklenen soru sayısı. 0 dönmesi hata değil — doldurulacak
    kombinasyon kalmamış ya da üretilenlerin hepsi elenmiş olabilir.
    """
    settings = get_settings()
    combos = pending_combos()

    if not combos:
        logger.debug("Doldurulacak havuz yok")
        return 0

    department, course, exam_type = combos[0]
    current = pool.pool_size(department, course, exam_type)
    target = (
        "sınırsız" if settings.pool_min_size <= 0 else str(settings.pool_min_size)
    )
    logger.info(
        "Havuz dolduruluyor: %s/%s/%s (mevcut %d, hedef %s)",
        department,
        course,
        exam_type,
        current,
        target,
    )

    try:
        approved, rejections = generator.generate_reviewed(
            department=department,
            course=course,
            exam_type=exam_type,
            count=settings.pool_batch_size,
        )
    except generator.NoReferencesError:
        # Referanslar silinmiş olabilir; bir sonraki turda başka kombinasyon
        # denenecek, o yüzden hata fırlatmıyoruz.
        logger.warning("Referans yok: %s/%s/%s", department, course, exam_type)
        return 0
    except Exception as exc:  # noqa: BLE001
        # Worker'ın çökmemesi kritik: bir turdaki hata bütün zamanlayıcıyı
        # durdurmamalı.
        logger.error("Üretim hatası (%s/%s): %s", course, exam_type, exc)
        return 0

    for reason in rejections:
        logger.info("Hakem reddi: %s", reason)

    added = pool.add_questions(
        approved,
        department=department,
        course=course,
        exam_type=exam_type,
    )

    # Şekilleri arka planda üretiyoruz: kullanıcı istediğinde hazır olsun.
    if added:
        figures.attach(added, approved)

    combo = (department, course, exam_type)
    if added:
        _mark_success(combo)
    else:
        # Üretilenlerin hepsi hakemden veya kopya filtresinden döndü.
        # Referanslardan çıkarılabilecek farklı sorular tükenmiş demektir.
        _mark_empty(combo)

    return added


def start_scheduler():
    """
    Zamanlayıcıyı kurar ve döndürür.

    APScheduler'ın BackgroundScheduler'ı: ayrı bir iş parçacığında çalışıyor,
    FastAPI'nin olay döngüsünü bloklamıyor. Redis/Celery kurmaya gerek yok —
    tek makinede tek süreç için fazlası gereksiz karmaşa.
    """
    from apscheduler.schedulers.background import BackgroundScheduler

    settings = get_settings()
    scheduler = BackgroundScheduler(timezone="UTC")

    scheduler.add_job(
        refill_once,
        trigger="interval",
        minutes=settings.refill_interval_minutes,
        # Sunucu bir süre uykuda kalıp uyanırsa birikmiş turları arka arkaya
        # çalıştırmasın: en fazla bir tanesi telafi edilsin.
        coalesce=True,
        max_instances=1,
        # İlk tur uygulama otursun diye 30 saniye gecikmeli.
        # DİKKAT: buraya None vermek "gecikmeli başla" değil, "duraklatılmış
        # olarak ekle" demek — iş hiç çalışmaz.
        next_run_time=datetime.now(timezone.utc) + timedelta(seconds=30),
    )

    scheduler.start()
    logger.info(
        "Havuz worker'ı başladı (her %d dakikada bir)",
        settings.refill_interval_minutes,
    )
    return scheduler