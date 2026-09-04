"""
Sınav metnini tek tek sorulara ayırma.

Neden ayırıyoruz?
Eski `db_service` bütün sınavı tek bir doküman olarak saklıyordu ve prompta
komple gönderiyordu. Bunun iki sonucu vardı: girdi token'ı şişiyordu ve model
"şu soruya benzer bir soru üret" yerine "şu sınava benzer bir şeyler yap"
diyordu. Soru bazında saklarsak hem 3.000 token yerine ~600 token gönderiyoruz
hem de gerçekten nokta atışı paralel soru çıkıyor.

Neden LLM'e ayırtmıyoruz?
Bu tamamen desen eşleme işi. Regex bedava, LLM değil.

Neden eski regex yetmiyordu?
`\\textbf{Soru 1:}` gibi LaTeX kalıplarına bağlıydı. OCR'dan veya PDF metin
katmanından gelen metinde o kalıplar olmuyor; orada "1.", "SORU 1)", "Q1." gibi
düz yazı işaretleri var. Buradaki ayırıcı önce numara işaretlerini deniyor,
bulamazsa boş satır bloklarına düşüyor, o da olmazsa metni tek parça bırakıyor.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

# Bir sorunun anlamlı sayılması için gereken en az karakter.
# Bunun altındakiler genelde "5 puan", "Ad Soyad:" gibi artıklar.
MIN_QUESTION_CHARS = 40

# Tek bir sorunun makul üst sınırı. Aşarsa muhtemelen ayırıcı iki soruyu
# birleştirmiştir; yine de saklıyoruz ama kırpıyoruz.
MAX_QUESTION_CHARS = 2500

# Soru başlangıcı işaretleri. Sıra önemli: en spesifikten en genele.
# (?m) satır başı eşleşmesi için, (?=...) ileriye bakış — böylece bölerken
# işaretin kendisi bir sonraki parçanın başında kalıyor.
QUESTION_MARKERS = [
    # \noindent\textbf{1.} / \textbf{Soru 1:} gibi LaTeX kalıpları
    r"(?m)^(?=\\noindent\\textbf\{\d{1,2}[\.\)]\})",
    r"(?m)^(?=\\textbf\{\s*(?:Soru|SORU|Question)\s*\d{1,2}\s*[\.\):]?\s*\})",
    r"(?m)^(?=\\textbf\{\d{1,2}[\.\)]\})",
    # Düz metin: "Soru 1:", "SORU 3)", "Question 2."
    r"(?m)^\s*(?=(?:Soru|SORU|Question|QUESTION)\s*\d{1,2}\s*[\.\):])",
    # Sadece numara: "1.", "2)", "3-"  (satır başında ve ardından boşluk)
    r"(?m)^\s*(?=\d{1,2}\s*[\.\)\-]\s+\S)",
]

# Soru metninin başındaki numara/etiket takıları — içerik değil, bunları atıyoruz.
LEADING_LABELS = [
    r"^\\noindent\\textbf\{\d{1,2}[\.\)]\}\s*",
    r"^\\textbf\{\s*(?:Soru|SORU|Question)\s*\d{1,2}\s*[\.\):]?\s*\}\s*",
    r"^\\textbf\{\d{1,2}[\.\)]\}\s*",
    r"^(?:Soru|SORU|Question|QUESTION)\s*\d{1,2}\s*[\.\):]\s*",
    r"^\d{1,2}\s*[\.\)\-]\s+",
]

# Sınav başlığı / künye satırları: soru değil, ayıklanmalı.
# Sınavlar ağırlıklı İngilizce olduğu için İngilizce ipuçları öncelikli.
HEADER_HINTS = (
    # İngilizce
    "university",
    "faculty",
    "department of",
    "midterm",
    "final exam",
    "name :",
    "name:",
    "id no",
    "student no",
    "section:",
    "duration",
    "questions",
    "good luck",
    "instructor",
    "points",
    "total",
    # Türkçe
    "ad soyad",
    "öğrenci no",
    "ogrenci no",
    "numara:",
    "süre:",
    "sure:",
    "tarih:",
    "başarılar",
    "basarilar",
    "vize sınavı",
    "final sınavı",
    "üniversitesi",
    "universitesi",
    "fakültesi",
    "fakultesi",
)

# Künye bloklarında sık görülen tarih/puan kalıpları.
_DATE_PATTERN = re.compile(
    r"\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|"
    r"October|November|December|Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|"
    r"Eylül|Ekim|Kasım|Aralık)\s+\d{4}\b",
    re.IGNORECASE,
)
# "5(10+10)" gibi puan dağılımı tabloları
_SCORE_PATTERN = re.compile(r"\d\(\d+\s*\+\s*\d+")

# Markdown'a çevrilecek LaTeX liste ortamları.
_ENV_CLEANUP = [
    (r"\\begin\{enumerate\}(\[[^\]]*\])?", ""),
    (r"\\end\{enumerate\}", ""),
    (r"\\begin\{itemize\}", ""),
    (r"\\end\{itemize\}", ""),
    (r"\\item\s*", "\n- "),
]


@dataclass
class QuestionChunk:
    text: str
    index: int
    fingerprint: str


def _normalize_whitespace(text: str) -> str:
    # Satır içi fazla boşlukları tek boşluğa indir, üçlü boş satırı ikiye çek.
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _strip_latex_wrapper(text: str) -> str:
    """LaTeX gövdesini alır: \\begin{document} ile \\end{document} arası."""
    if r"\begin{document}" in text:
        text = text.split(r"\begin{document}", 1)[1]
    if r"\end{document}" in text:
        text = text.split(r"\end{document}", 1)[0]
    # Yorum satırlarını at
    text = re.sub(r"(?m)^\s*%.*$", "", text)
    return text


def _clean_question(text: str) -> str:
    for pattern in LEADING_LABELS:
        text = re.sub(pattern, "", text)
    for pattern, replacement in _ENV_CLEANUP:
        text = re.sub(pattern, replacement, text)
    return _normalize_whitespace(text)


def _looks_like_header(text: str) -> bool:
    """
    Künye bloğu mu?

    Tek bir ipucu yetmiyor: "total" kelimesi gerçek bir soruda da geçebilir.
    Bu yüzden birden çok sinyal arıyoruz — künye ipuçları, tarih kalıbı, puan
    tablosu — ve kısa metinlerde eşiği düşürüyoruz.
    """
    lowered = text.lower()
    score = sum(1 for hint in HEADER_HINTS if hint in lowered)

    if _DATE_PATTERN.search(text):
        score += 1
    if _SCORE_PATTERN.search(text):
        score += 1

    if score >= 3:
        return True
    # Kısa metinde iki sinyal yeter; uzun metinde soru olma ihtimali yüksek.
    return score >= 2 and len(text) < 400


def fingerprint(text: str) -> str:
    """
    Aynı sorunun iki kez veritabanına girmesini engellemek için parmak izi.
    Boşluk ve büyük/küçük harf farkları yok sayılıyor, böylece aynı sınav
    ikinci kez yüklendiğinde kopya oluşmuyor.
    """
    normalized = re.sub(r"\s+", " ", text.lower()).strip()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def _split_by_markers(body: str) -> list[str]:
    """Numara/etiket işaretlerine göre bölmeyi dener; ilk işe yarayan kazanır."""
    for pattern in QUESTION_MARKERS:
        parts = [p for p in re.split(pattern, body) if p.strip()]
        # Tek parça çıktıysa bu desen bu metinde yok demektir, sıradakini dene.
        if len(parts) >= 2:
            return parts
    return []


def _split_by_blocks(body: str) -> list[str]:
    """
    İşaret bulunamadığında: boş satırla ayrılmış bloklara düş.
    OCR çıktılarında numaralar kaybolabiliyor, bu son çare.
    """
    return [b for b in re.split(r"\n\s*\n", body) if b.strip()]


def split_questions(raw_text: str) -> list[QuestionChunk]:
    """
    Sınav metnini soru parçalarına ayırır.

    Boş liste dönerse metin ayrıştırılamamış demektir — çağıran taraf bunu
    admin'e "bu dosya bölünemedi" diye bildirmeli, sessizce geçmemeli.
    """
    if not raw_text or not raw_text.strip():
        return []

    body = _normalize_whitespace(_strip_latex_wrapper(raw_text))

    parts = _split_by_markers(body)
    if not parts:
        parts = _split_by_blocks(body)

    chunks: list[QuestionChunk] = []
    seen: set[str] = set()

    for part in parts:
        cleaned = _clean_question(part)

        if len(cleaned) < MIN_QUESTION_CHARS:
            continue
        if _looks_like_header(cleaned):
            continue
        if len(cleaned) > MAX_QUESTION_CHARS:
            cleaned = cleaned[:MAX_QUESTION_CHARS].rsplit(" ", 1)[0]

        fp = fingerprint(cleaned)
        if fp in seen:
            continue
        seen.add(fp)

        chunks.append(
            QuestionChunk(text=cleaned, index=len(chunks), fingerprint=fp)
        )

    return chunks