"""
Metin benzerliği.

Üç yerde aynı soruya cevap veriyoruz: "bu metin elimizdekinin kopyası mı?"
- generator: aynı partide üretilmiş iki soru
- pool: farklı turlarda üretilmiş iki soru
- retrieval: aynı sınavın ikinci kez yüklenmesi

Ama üçünün "kopya" tanımı aynı değil, eşikleri de farklı. Aşağıda ayrıntısı var.

Neden embedding değil?
Bu kontroller her üretimde ve her yüklemede çalışıyor; embedding çağırmak
gereksiz maliyet. Aradığımız şey anlamsal yakınlık değil, kaba bir kopya.
"""

from __future__ import annotations

import re

# --- Eşikler -----------------------------------------------------------------

# Aynı parti içinde. Sıkı: model burada kendini tekrar ediyor, harfleri
# değiştirip aynı soruyu iki kez yazıyor. Bunu yakalamak istiyoruz.
GENERATION_THRESHOLD = 0.55

# Havuza eklerken. Gevşek ve sayı kontrollü.
#
# Neden gevşek? Aynı konudan farklı sorular olması İSTENEN bir şey. "Şu
# matrisin determinantını bul" tipinde on tane soru olabilir ve olmalı da —
# öğrenci pratik yapıyor, tekrar öğrenmenin bir parçası. Üstelik teslimat
# kaydı sayesinde hiç kimse aynı soruyu iki kez görmüyor, yani havuzda benzer
# soruların durması kullanıcı açısından zararsız.
#
# Elemek istediğimiz şey, kelimesi kelimesine aynı sorunun tekrar üretilmesi.
POOL_THRESHOLD = 0.75

# Yükleme sırasında. Burada elimizdeki şey gerçek bir sınav sorusu; geçerli bir
# referansı yanlışlıkla atmak, kopyayı kaçırmaktan daha pahalı.
INGEST_THRESHOLD = 0.75


# --- Belirteçler --------------------------------------------------------------


def tokens(text: str) -> set[str]:
    """
    Sözcük kümesi — sorunun "iskeleti".

    LaTeX komutları ayıklanıyor: iki soru da bmatrix kullanıyor diye benzer
    sayılmasınlar, asıl fark içerikte.
    """
    stripped = re.sub(r"\\[a-zA-Z]+", " ", text)
    stripped = re.sub(r"[^a-zA-Z\s]", " ", stripped)
    return {w for w in stripped.lower().split() if len(w) > 2}


def number_sequence(text: str) -> tuple[str, ...]:
    """
    Metindeki sayılar, GEÇTİKLERİ SIRAYLA.

    Küme değil dizi kullanıyoruz. İki farklı 3x3 matris rakamlarını 0-9
    arasından seçtiği için küme olarak tesadüfen yarı yarıya örtüşüyor ve
    "aynı veri" gibi görünüyor. Sıra ise keskin bir ölçüt: birebir kopyalanmış
    bir soruda sayı dizisi aynen tekrar eder, yeniden üretilmiş bir soruda
    neredeyse hiç tutmaz.

    Ayrı tutmanın sebebi: iki determinant sorusu neredeyse aynı sözcükleri
    kullanır ("compute the determinant, determine whether invertible") ve
    yalnızca matris değerleriyle ayrışır. Sayıları sözcüklerle aynı torbaya
    atınca ayırt edici kısım kayboluyordu — eski tokenizer üç karakterden kısa
    belirteçleri attığı için matris değerlerini hiç görmüyordu.
    """
    return tuple(re.findall(r"-?\d+", text))


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def similarity(a: str, b: str) -> float:
    """Sözcük düzeyinde Jaccard benzerliği. 0 ile 1 arası."""
    return _jaccard(tokens(a), tokens(b))


def too_similar(
    a: str,
    b: str,
    threshold: float = GENERATION_THRESHOLD,
    *,
    check_numbers: bool = False,
) -> bool:
    """
    İki metin kopya sayılmalı mı?

    check_numbers=True iken sözcükler örtüşse bile sayılar belirgin şekilde
    farklıysa "kopya değil" diyoruz. Aynı kalıpta ama farklı verilerle kurulmuş
    soru, pratik açısından yeni bir sorudur.

    Bu gevşetmeyi parti içinde KULLANMIYORUZ: model orada aynı soruyu
    sayılarını da değiştirerek tekrar yazabiliyor ve onu yakalamak istiyoruz.
    """
    if similarity(a, b) < threshold:
        return False

    if not check_numbers:
        return True

    na, nb = number_sequence(a), number_sequence(b)
    if not na or not nb:
        # Sayısal içeriği olmayan sorular (teorik/ispat) — sözcük kararı geçerli.
        return True

    # Sözcükler aynı, sayı dizisi de aynı → gerçekten aynı soru.
    # Sayılar farklıysa aynı kalıpta yeni bir soru; havuzda durmasında sakınca
    # yok, hatta pratik için gerekli.
    return na == nb