"""
Soru üretimi.

Akış:
  retrieval.sample_references()  →  referans soruları çek (rastgele, çeşitlilik için)
  llm.complete_json()            →  zincirden üret, şemayla doğrula
  judge.review_questions()       →  toplu denetim (isteğe bağlı)

Token açısından kritik iki karar:

1. Referans olarak tüm sınav değil, 2-3 soru gönderiyoruz. Eski kodda bütün
   sınav metni prompta giriyordu (~3000 token); şimdi ~600 token.

2. Referanslar kırpılıyor. Tek bir bozuk OCR çıktısı 2500 karaktere kadar
   uzayabiliyor ve bunun tamamını göndermenin faydası yok.
"""

from __future__ import annotations

import logging

from app.config import get_settings
from app.prompts import EXAM_GENERATOR_PROMPT
from app.schemas import GeneratedQuestion, GenerationResult
from app.services import retrieval
from app.services.llm import AllProvidersFailed, complete_json
from app.services.similarity import too_similar

logger = logging.getLogger(__name__)

# Tek bir referans sorunun prompta girecek azami uzunluğu.
MAX_REFERENCE_CHARS = 700

# Referans sayısı sabit değil, istenen soru sayısına göre belirleniyor.
#
# Neden: 5 soru isteyip 3 referans vermek modeli referanssız üretime zorluyor
# ve model müfredat dışına çıkıyor (vizede olmayan özdeğer sorusu gibi).
# Kabaca soru başına bir referans hedefliyoruz.
#
# Alt sınır 3: tek referansla model onu neredeyse kopyalıyor.
# Üst sınır 6: daha fazlası hem token yakıyor hem model referansları harmanlayıp
# bulanık melez sorular üretmeye başlıyor.
MIN_REFERENCES = 3
MAX_REFERENCES = 6


def _reference_count(requested: int) -> int:
    return max(MIN_REFERENCES, min(requested, MAX_REFERENCES))


class NoReferencesError(RuntimeError):
    """Bu ders için veritabanında hiç referans soru yok."""


def deduplicate(questions: list[GeneratedQuestion]) -> tuple[list[GeneratedQuestion], list[str]]:
    """
    Aynı partide birbirinin kopyası olan soruları eler.

    Model, elindeki referans sayısı az olduğunda aynı soruyu harflerini
    değiştirerek tekrar üretiyor. Prompt'ta yasakladık ama kural unutuluyor;
    bu kontrol garantiyi koda alıyor.
    """
    kept: list[GeneratedQuestion] = []
    dropped: list[str] = []

    for question in questions:
        twin = next(
            (k for k in kept if too_similar(k.prompt, question.prompt)), None
        )
        if twin is not None:
            dropped.append(f"'{question.topic}' ~ '{twin.topic}' ile aynı soru")
            continue
        kept.append(question)

    return kept, dropped


# Şekle atıf tespiti figures modülünde: hem burada (üretim sırasında) hem
# çizim sonrasında aynı kontrol gerekiyor, iki ayrı liste tutmak ikisinin
# ayrışması demekti.
from app.services.figures import mentions_figure as _mentions_figure  # noqa: E402


def _build_user_message(references: list[str], count: int) -> str:
    """
    Kullanıcı mesajını kurar.

    Numaralandırma modelin referansları ayrı ayrı görmesini sağlıyor; düz
    birleştirilmiş metinde nerede bitip nerede başladıklarını kaçırıyor.

    Şekle atıf yapan referanslar ayrıca etiketleniyor: o soru kağıtta bir
    çizimle geliyordu ve karşılığının da şekilli olması gerekiyor.
    """
    blocks = []
    for i, text in enumerate(references, 1):
        trimmed = text[:MAX_REFERENCE_CHARS].strip()
        marker = (
            "\n[This reference came with a FIGURE on the exam paper. "
            "Your version of it must include a figure too.]"
            if _mentions_figure(trimmed)
            else ""
        )
        blocks.append(f"[Reference {i}]{marker}\n{trimmed}")

    return (
        "\n\n".join(blocks)
        + f"\n\nGenerate exactly {count} new questions based on these references."
    )


def pick_references(
    department: str, course: str, exam_type: str, count: int
) -> list[str]:
    """Bu üretimde kullanılacak referansları seçer. Ayrı fonksiyon çünkü
    çağıran taraf (script, worker, log) hangi referansların kullanıldığını
    görmek isteyebiliyor."""
    refs = retrieval.sample_references(
        department, course, exam_type, k=_reference_count(count)
    )
    return [r.text for r in refs]


def generate_questions(
    *,
    department: str,
    course: str,
    exam_type: str,
    count: int,
    references: list[str] | None = None,
) -> list[GeneratedQuestion]:
    """
    Bir grup yeni soru üretir. Hakemden geçmemiş ham çıktı döner.

    NoReferencesError: bu ders için referans yoksa. Çağıran taraf bunu
    kullanıcıya "bu ders için henüz sınav yüklenmemiş" diye çevirmeli.
    AllProvidersFailed: zincirdeki hiçbir sağlayıcı geçerli yanıt vermedi.
    """
    settings = get_settings()

    if references is None:
        references = pick_references(department, course, exam_type, count)
    if not references:
        raise NoReferencesError(f"{department}/{course}/{exam_type} için referans yok")

    result: GenerationResult = complete_json(
        system=EXAM_GENERATOR_PROMPT,
        user=_build_user_message(references, count),
        chain=settings.generation_chain,
        schema=GenerationResult,
        max_tokens=settings.generation_max_tokens,
        # Referanslara fazla yapışmasın diye biraz yüksek; 0.3'te neredeyse
        # kopyalıyor, 1.0'da konudan sapıyor.
        temperature=0.8,
        reasoning_effort=settings.generation_reasoning,
    )

    questions = result.questions

    if len(questions) != count:
        # Şema en az 1 soru garanti ediyor ama tam sayıyı garanti etmiyor.
        # Fazlaysa kırpıyoruz, eksikse elimizdekiyle devam ediyoruz —
        # havuz mimarisinde eksik üretim sorun değil, bir sonraki turda tamamlanır.
        logger.info("%d soru istendi, %d geldi", count, len(questions))
        questions = questions[:count]

    questions, dropped = deduplicate(questions)
    for reason in dropped:
        logger.info("Kopya elendi: %s", reason)

    return questions


def generate_reviewed(
    *,
    department: str,
    course: str,
    exam_type: str,
    count: int,
    references: list[str] | None = None,
) -> tuple[list[GeneratedQuestion], list[str]]:
    """
    Üretir ve hakemden geçirir. Havuz worker'ının kullanacağı fonksiyon bu.

    Dönen: (onaylanan sorular, reddedilenlerin gerekçeleri)

    Hakem çağrısı başarısız olursa soruları reddetmiyoruz — denetimsiz geçmek,
    hiç soru olmamasından iyi. Ama bu durumu log'a düşüyoruz.
    """
    from app.services.judge import review_questions  # döngüsel import olmasın

    questions = generate_questions(
        department=department,
        course=course,
        exam_type=exam_type,
        count=count,
        references=references,
    )

    try:
        verdicts = review_questions(questions)
    except AllProvidersFailed as exc:
        logger.warning("Hakem çalışmadı, sorular denetimsiz geçiyor: %s", exc)
        return questions, []

    approved: list[GeneratedQuestion] = []
    rejections: list[str] = []

    by_index = {v.index: v for v in verdicts}
    for i, question in enumerate(questions):
        verdict = by_index.get(i)
        if verdict is None:
            # Hakem bu soru için karar döndürmemiş: şüphede kalma, ele.
            rejections.append(f"[{i}] hakem karar vermedi")
            continue
        if verdict.approved:
            approved.append(question)
        else:
            rejections.append(f"[{i}] {verdict.reason}")

    approved, dangling = _drop_dangling_figures(approved)
    rejections.extend(dangling)

    _backfill_topics(approved)
    _normalize_topics(approved)

    logger.info(
        "%s/%s: %d üretildi, %d onaylandı",
        course,
        exam_type,
        len(questions),
        len(approved),
    )
    return approved, rejections


def _drop_dangling_figures(
    questions: list[GeneratedQuestion],
) -> tuple[list[GeneratedQuestion], list[str]]:
    """
    Şekle atıf yapıp şekil vermeyen soruları eler.

    "The region shown in the figure" diyen ama şekli olmayan bir soru
    cevaplanamaz: öğrenci hangi bölgeden bahsedildiğini bilemiyor. Metni
    kendi kendine yeterli olan sorular (şekilden hiç söz etmeyenler) geçiyor;
    eleme yalnızca havada kalan atıflar için.

    Hakem bunu yakalayamıyor çünkü ona yalnızca metin gidiyor, şekil alanı
    gitmiyor.
    """
    kept: list[GeneratedQuestion] = []
    rejected: list[str] = []

    for index, question in enumerate(questions):
        if question.figure is None and _mentions_figure(question.prompt):
            rejected.append(
                f"[{index}] şekle atıf var ama şekil yok — cevaplanamaz"
            )
            continue
        kept.append(question)

    if rejected:
        logger.info("%d soru havada kalan şekil atfı yüzünden elendi", len(rejected))

    return kept, rejected


def _backfill_topics(questions: list[GeneratedQuestion]) -> None:
    """
    Konusu boş kalan sorulara etiket üretir.

    Model bazen `topic` alanını boş bırakıyor; kullanıcı kartta yalnızca zorluk
    görüyor ve sorunun neyi ölçtüğünü anlamıyor. Prompt'ta zorunlu tutuyoruz
    ama tek başına yeterli değil — bir alanın "her zaman dolu geleceğine"
    güvenmek, er ya da geç boş gelmesi demek.

    Etiketleme servisi zaten var (yükleme sırasında kullanılıyor), aynısını
    burada da çalıştırıyoruz. Yalnızca eksikler için: hepsini yeniden
    etiketlemek gereksiz bir LLM çağrısı.
    """
    missing = [q for q in questions if not q.topic.strip()]
    if not missing:
        return

    from app.services.labeling import label_questions  # döngüsel import olmasın

    try:
        labels = label_questions([q.prompt for q in missing])
    except Exception as exc:  # noqa: BLE001
        # Etiket kozmetik: alınamazsa soruyu atmıyoruz.
        logger.info("Konu etiketi üretilemedi: %s", exc)
        return

    for question, label in zip(missing, labels, strict=False):
        if label:
            question.topic = label
            


def _normalize_topics(questions: list[GeneratedQuestion]) -> None:
    """
    Üretilen soruların konu etiketlerini tek biçime indirger.

    Yükleme yolunda (labeling.py) bu zaten yapılıyordu ama üretim yolunda
    yapılmıyordu: modelin yazdığı etiket olduğu gibi kaydediliyordu. Sonuç,
    aynı kavramın veritabanında dört ayrı satır olarak durmasıydı —
    "Matrix Inverse", "Matrix inverse", "Matrix Inversion", "Matrix inversion".
    Konu dağılımı bu haliyle sayılamıyordu.
    """
    from app.services.labeling import normalize_topic  # döngüsel import olmasın

    for question in questions:
        if question.topic:
            question.topic = normalize_topic(question.topic)