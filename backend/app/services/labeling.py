"""
Konu etiketleme.

Neden gerekli:
Referansları rastgele seçmek sınavın konu ağırlığını yansıtmıyor. Determinant
her yıl çıkmışsa (4 sınavda 4 kez), Gram-Schmidt bir kez çıkmışsa, rastgele
örneklemede ikisinin seçilme şansı eşit oluyor. Oysa öğrenciye determinant
sorusu gelme olasılığı gerçekte dört kat fazla olmalı.

Etiketler bunu ölçülebilir yapıyor: her soru bir konuya bağlanınca konu
dağılımı sayılabiliyor, örnekleme de o dağılıma göre yapılabiliyor.

Maliyeti:
Sınav başına tek LLM çağrısı, yükleme anında, bir kez. 20 sınav yüklesen 20
çağrı — üretim tarafındaki binlerce çağrının yanında yok hükmünde. Etiket
Chroma metadata'sına yazılıyor, bir daha hesaplanmıyor.
"""

from __future__ import annotations

import logging

from app.config import get_settings
from app.prompts import TOPIC_LABEL_PROMPT
from app.schemas import TopicLabelResult
from app.services.llm import AllProvidersFailed, complete_json

logger = logging.getLogger(__name__)

# Etiketleme için soru başına gönderilen azami karakter.
# Konuyu anlamak için sorunun tamamı gerekmiyor, başı yetiyor.
MAX_CHARS_PER_QUESTION = 400

UNKNOWN = ""


def label_questions(
    texts: list[str], known_topics: list[str] | None = None
) -> list[str]:
    """
    Soru listesine konu etiketi üretir.

    known_topics: bu ders için daha önce kullanılmış etiketler. Model her
    sınavı sıfırdan etiketlediğinde aynı kavrama farklı adlar veriyor
    ("subspace basis" ve "vector space basis" gibi) ve konu dağılımı
    parçalanıyor. Mevcut sözlüğü göstererek yeniden kullanmasını sağlıyoruz.

    Her zaman girdiyle aynı uzunlukta liste döndürür. Etiketlenemeyen sorular
    boş string alır — çağıran taraf bunu "konusuz" olarak saklayıp devam eder.
    Etiketleme başarısız diye yükleme iptal edilmemeli.
    """
    if not texts:
        return []

    settings = get_settings()
    labels: list[str] = [UNKNOWN] * len(texts)

    numbered = "\n\n".join(
        f"[index {i}]\n{text[:MAX_CHARS_PER_QUESTION].strip()}"
        for i, text in enumerate(texts)
    )

    vocabulary = ""
    if known_topics:
        listed = "\n".join(f"- {t}" for t in sorted(set(known_topics)))
        vocabulary = (
            "\nLabels already used for this course. Reuse one of these whenever "
            "the question fits it; only invent a new label if none applies:\n"
            f"{listed}\n"
        )

    try:
        result: TopicLabelResult = complete_json(
            system=TOPIC_LABEL_PROMPT,
            user=f"Label these {len(texts)} questions.\n{vocabulary}\n{numbered}",
            chain=settings.judge_chain,
            schema=TopicLabelResult,
            max_tokens=settings.judge_max_tokens,
            # Tutarlılık istiyoruz: aynı konu hep aynı etiketi almalı.
            temperature=0.0,
            reasoning_effort=settings.judge_reasoning,
        )
    except AllProvidersFailed as exc:
        logger.warning("Konu etiketleme yapılamadı: %s", exc)
        return labels

    for label in result.labels:
        if 0 <= label.index < len(labels):
            labels[label.index] = normalize_topic(label.topic)

    missing = sum(1 for label in labels if not label)
    if missing:
        logger.info("%d soru etiketsiz kaldı", missing)

    return labels


# Sonu "s" ile biten ama çoğul OLMAYAN sözcük sonları.
# Bunları atlamazsak "basis" → "basi", "nucleus" → "nucleu" oluyor.
_NOT_PLURAL_ENDINGS = ("is", "ss", "us", "as", "os")


def normalize_topic(topic: str) -> str:
    """
    Etiketleri tek biçime indirger.

    Model kurala rağmen "Determinant" / "determinants" gibi varyantlar
    üretebiliyor. Küçük harf + boşluk temizliği kaba eşleşmeyi sağlıyor,
    çoğul eki de son sözcükten atılıyor.

    Çoğul temizliği yalnızca SON sözcüğe uygulanıyor ve gerçekten çoğul
    görünenlere: "subspace basis" etiketinde "basis" tekil, dokunulmamalı.
    """
    cleaned = " ".join(topic.lower().split())
    if not cleaned:
        return ""

    words = cleaned.split()
    last = words[-1]
    if (
        last.endswith("s")
        and len(last) > 4
        and not last.endswith(_NOT_PLURAL_ENDINGS)
    ):
        words[-1] = last[:-1]

    return " ".join(words)