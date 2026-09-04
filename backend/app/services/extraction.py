"""
Dosyadan metin çıkarma.

Katman sırası, ucuzdan pahalıya:
  1. Dijital metin katmanı (PyMuPDF)  → bedava, en doğru
  2. Tesseract OCR                    → bedava, düz metin iyi / matematik zayıf
  3. LLM vision                       → token harcar, otomatik devreye girer

Geçiş otomatik: bir katman başarısız olur ya da çıktısı bozuk görünürse bir
alttaki devralır, kimseye sormadan. Vision'ın kontrolsüz token yakmaması için
tek fren MAX_VISION_PAGES: o sayfadan uzun dosyalarda vision'a sadece ilk N
sayfa gider, gerisi elimizdeki en iyi yerel çıktıyla tamamlanır.

needs_review bayrağı yine set ediliyor ama artık işlemi durdurmuyor; admin
panelinde "bu dosyayı gözden geçir" rozeti olarak görünecek. Amacı bozuk
referansın sessizce veritabanında kalmasını engellemek: bozuk referans →
bozuk üretim → hakem reddi → yeniden üretim, yani beklenenden fazla token.
"""

from __future__ import annotations

import io
import logging
import re
from dataclasses import dataclass, field
from typing import Literal

import fitz  # PyMuPDF

from app.config import get_settings

logger = logging.getLogger(__name__)

ExtractionMethod = Literal["digital", "ocr", "vision", "plain"]

# Bir sayfada bundan az karakter varsa metin katmanı yok/işe yaramaz sayıyoruz.
MIN_CHARS_PER_PAGE = 80

# OCR için sayfayı büyütme katsayısı. 2 = ~144 DPI, Tesseract için alt sınır.
# 3'e çıkarmak doğruluğu artırır ama işlemi belirgin yavaşlatır.
OCR_ZOOM = 3

# Matematiksel içerik göstergeleri: bunlar varsa metin muhtemelen doğru okunmuş.
MATH_HINTS = ("$", "\\frac", "\\int", "\\sum", "=", "^", "_")

# Vision'a gönderilecek azami sayfa sayısı. Tek bir 40 sayfalık taramanın
# günlük kotayı bitirmesini engelleyen fren.
MAX_VISION_PAGES = 4

# Tesseract kelime bazında güven skoru veriyor. Temiz bir taramada düşük
# güvenli kelime oranı %10'un altında kalıyor; formülleri bozulan taramalarda
# %20'yi aşıyor. Regex tahminlerinden daha güvenilir bir sinyal.
LOW_CONF_THRESHOLD = 60
MAX_LOW_CONF_RATIO = 0.20

# OCR'ın matematiği bozduğuna işaret eden desenler.
GARBLED_PATTERNS = (
    r"[a-zA-Z]\d{3,}",  # "x2345" gibi indeks/üs karmaşası
    r"[|]{2,}",  # integral/mutlak değer artıkları
    r"[^\w\s\.,;:\?\!\-\+\=\(\)\[\]\{\}\$\\/\*\^&%#@'\"°²³]{2,}",  # tanınmayan simge kümeleri
)


@dataclass
class ExtractionResult:
    text: str
    method: ExtractionMethod
    needs_review: bool = False
    notes: list[str] = field(default_factory=list)

    @property
    def is_usable(self) -> bool:
        return len(self.text.strip()) > 50


# Windows installer'ının Tesseract'ı bıraktığı olağan yerler.
_WINDOWS_TESSERACT_PATHS = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    r"C:\Users\{user}\AppData\Local\Programs\Tesseract-OCR\tesseract.exe",
)


def _configure_tesseract() -> None:
    """
    pytesseract'a ikili dosyanın yerini söyler.

    Windows installer'ı PATH'e eklemediği için pytesseract "kurulu değil"
    sanıyor. Önce ayardaki yolu, sonra bilinen kurulum yollarını deniyoruz.
    Linux/macOS'ta PATH zaten doğru olduğu için bu fonksiyon hiçbir şey yapmaz.
    """
    import os

    import pytesseract

    configured = get_settings().tesseract_cmd
    if configured:
        pytesseract.pytesseract.tesseract_cmd = configured
        return

    if os.name != "nt":
        return

    user = os.environ.get("USERNAME", "")
    for candidate in _WINDOWS_TESSERACT_PATHS:
        path = candidate.format(user=user)
        if os.path.exists(path):
            pytesseract.pytesseract.tesseract_cmd = path
            return


def tesseract_available() -> bool:
    """
    Tesseract kurulu mu? pip paketi tek başına yetmiyor, ikili dosya da gerekli.
    Kurulu değilse çökmüyoruz: taranmış dosyalar doğrudan vision katmanına düşer.
    Yani Tesseract'ı kurmadan da sistem çalışır, sadece daha çok token harcar.
    """
    try:
        import pytesseract

        _configure_tesseract()
        pytesseract.get_tesseract_version()
        return True
    except Exception as exc:
        logger.info("Tesseract bulunamadı: %s", exc)
        return False


# --------------------------------------------------------------- kalite ölçümü


def _autorotate(image):
    """
    Taranmış sayfaların yönünü düzeltir.

    Telefon uygulamalarıyla (CamScanner vb.) taranan sınavlar sık sık 90 derece
    yatık geliyor ve PDF'in rotation alanı 0 olduğu için bunu metaveriden
    anlayamıyoruz. Tesseract'ın OSD modu görüntüye bakıp açıyı söylüyor.

    Düşük güvenle gelen tahminleri uyguluyoruz çünkü yanlış yön OCR'ı tamamen
    çöpe çeviriyor; OSD'nin güven skoru bu işte doğal olarak düşük çıkıyor.
    """
    import pytesseract

    _configure_tesseract()
    try:
        osd = pytesseract.image_to_osd(image)
    except Exception:
        return image

    match = re.search(r"Rotate:\s*(\d+)", osd)
    if not match:
        return image

    angle = int(match.group(1))
    if angle % 360 == 0:
        return image
    # PIL saat yönünün tersine döndürüyor, OSD saat yönünde açı veriyor.
    return image.rotate(-angle, expand=True)


def _ocr_page(image, lang: str) -> tuple[str, float]:
    """
    Bir görüntüyü OCR'lar; metni ve düşük güvenli kelime oranını döndürür.

    image_to_string yerine image_to_data kullanıyoruz çünkü ikincisi kelime
    bazında güven skoru da veriyor.

    Dikkat: image_to_data kelime kelime döndürüyor, satır bilgisi ayrı
    sütunlarda. Kelimeleri düz boşlukla birleştirirsek satır sonları kaybolur
    ve ayırıcı "1.", "2." gibi satır başı işaretlerini göremez — bütün sınav
    tek soru gibi görünür. Bu yüzden (block, paragraph, line) üçlüsüne göre
    grupluyoruz.
    """
    import pytesseract

    _configure_tesseract()
    data = pytesseract.image_to_data(
        image, lang=lang, output_type=pytesseract.Output.DICT
    )

    lines: dict[tuple[int, int, int], list[str]] = {}
    confidences: list[int] = []

    for i, word in enumerate(data["text"]):
        if not word.strip():
            continue
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        lines.setdefault(key, []).append(word)

        conf = int(float(data["conf"][i]))
        if conf >= 0:
            confidences.append(conf)

    # Anahtarları sıralamak okuma sırasını koruyor.
    text = "\n".join(" ".join(words) for _, words in sorted(lines.items()))

    if not confidences:
        return text, 1.0

    low = sum(1 for c in confidences if c < LOW_CONF_THRESHOLD)
    return text, low / len(confidences)


def _looks_garbled(text: str) -> bool:
    """
    OCR çıktısının matematik açısından güvenilir olup olmadığına dair kaba bir
    tahmin. Kesin değil — amacı hata yakalamak değil, admin'e "buna bir bak"
    demek.
    """
    if not text.strip():
        return True

    for pattern in GARBLED_PATTERNS:
        if len(re.findall(pattern, text)) >= 3:
            return True

    # Metin uzun ama hiç matematik işareti yoksa, formüller kaybolmuş olabilir.
    if len(text) > 500 and not any(hint in text for hint in MATH_HINTS):
        return True

    return False


# ------------------------------------------------------------ katman 1: dijital


def extract_digital(pdf_bytes: bytes) -> ExtractionResult:
    """PDF'in kendi metin katmanını okur. Maliyeti sıfır."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages: list[str] = []
    empty_pages = 0

    for page in doc:
        # "text" modu okuma sırasını korur; "raw" daha hızlı ama sütunları karıştırır.
        content = page.get_text("text").strip()
        if len(content) < MIN_CHARS_PER_PAGE:
            empty_pages += 1
        pages.append(content)

    doc.close()
    text = "\n\n".join(p for p in pages if p)
    notes: list[str] = []

    if empty_pages:
        notes.append(f"{empty_pages} sayfada metin katmanı bulunamadı")

    return ExtractionResult(
        text=text,
        method="digital",
        # Dijital metin doğru olduğu için sadece sayfa boşsa uyarıyoruz.
        needs_review=bool(empty_pages) and len(text.strip()) < 200,
        notes=notes,
    )


# ---------------------------------------------------------------- katman 2: OCR


def extract_with_ocr(pdf_bytes: bytes, lang: str | None = None) -> ExtractionResult:
    """
    Taranmış PDF'i sayfa sayfa görsele çevirip Tesseract'a verir.

    Tesseract'ın ikili dosyası (binary) ayrıca kurulmalı, pip paketi yetmez:
      Windows : https://github.com/UB-Mannheim/tesseract/wiki  (Turkish dil
                paketini kurulum sırasında işaretle)
      Ubuntu  : sudo apt install tesseract-ocr tesseract-ocr-tur
    """
    try:
        from PIL import Image
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "OCR için pytesseract ve Pillow gerekli: pip install pytesseract pillow"
        ) from exc

    lang = lang or get_settings().ocr_lang
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages: list[str] = []
    ratios: list[float] = []

    for page in doc:
        pix = page.get_pixmap(matrix=fitz.Matrix(OCR_ZOOM, OCR_ZOOM))
        image = _autorotate(Image.open(io.BytesIO(pix.tobytes("png"))))
        text, low_ratio = _ocr_page(image, lang)
        if text.strip():
            pages.append(text.strip())
            ratios.append(low_ratio)

    doc.close()
    text = "\n\n".join(pages)
    avg_low = sum(ratios) / len(ratios) if ratios else 1.0
    suspicious = avg_low > MAX_LOW_CONF_RATIO or _looks_garbled(text)

    notes: list[str] = []
    if suspicious:
        notes.append(
            f"OCR güveni düşük (kelimelerin %{avg_low * 100:.0f}'i şüpheli), "
            "formüller bozulmuş olabilir"
        )

    return ExtractionResult(
        text=text,
        method="ocr",
        needs_review=suspicious,
        notes=notes,
    )


def ocr_image(image_bytes: bytes, lang: str | None = None) -> ExtractionResult:
    """Doğrudan yüklenen fotoğraf/ekran görüntüsü için."""
    try:
        from PIL import Image
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "OCR için pytesseract ve Pillow gerekli: pip install pytesseract pillow"
        ) from exc

    lang = lang or get_settings().ocr_lang
    image = _autorotate(Image.open(io.BytesIO(image_bytes)))
    text, low_ratio = _ocr_page(image, lang)
    suspicious = low_ratio > MAX_LOW_CONF_RATIO or _looks_garbled(text)

    return ExtractionResult(
        text=text.strip(),
        method="ocr",
        needs_review=suspicious,
        notes=(
            [f"Görsel OCR güveni düşük (%{low_ratio * 100:.0f} şüpheli kelime)"]
            if suspicious
            else []
        ),
    )


# ------------------------------------------------------------------- yönlendirme


def extract(filename: str, file_bytes: bytes) -> ExtractionResult:
    """
    Dosya türüne göre doğru katmanı seçer, başarısız olursa bir alta düşer.
    Karar otomatik, kullanıcı onayı beklenmiyor.
    """
    ext = filename.rsplit(".", 1)[-1].lower()

    if ext == "txt":
        return ExtractionResult(
            text=file_bytes.decode("utf-8", errors="replace"),
            method="plain",
        )

    if ext in ("png", "jpg", "jpeg", "webp"):
        if tesseract_available():
            result = ocr_image(file_bytes)
            # OCR temiz göründüyse iş bitti, token harcamıyoruz.
            if result.is_usable and not result.needs_review:
                return result
        # Tesseract yok ya da çıktısı şüpheli: tek görsel, sayfa freni gerekmiyor.
        return _vision_fallback(file_bytes, "image/png")

    if ext == "pdf":
        digital = extract_digital(file_bytes)
        # Metin katmanı yeterliyse burada bitiyor — dosyaların çoğu buradan çıkar.
        if digital.is_usable and not digital.needs_review:
            return digital

        ocr = ExtractionResult(text="", method="ocr")
        if tesseract_available():
            ocr = extract_with_ocr(file_bytes)
            if ocr.is_usable and not ocr.needs_review:
                return ocr
        else:
            digital.notes.append("Tesseract kurulu değil, OCR katmanı atlandı")

        # Yerel katmanların ikisi de zayıf: vision devralıyor.
        vision = _vision_fallback(file_bytes, "application/pdf")
        if vision.is_usable:
            return vision

        # Vision da boş döndüyse elimizdeki en iyi yerel çıktıyı uyarıyla ver.
        best = ocr if len(ocr.text) > len(digital.text) else digital
        best.needs_review = True
        best.notes.append("Tüm katmanlar zayıf kaldı, metni elle düzeltmen gerekebilir")
        return best

    return ExtractionResult(
        text="",
        method="plain",
        needs_review=True,
        notes=[f"Desteklenmeyen dosya türü: .{ext}"],
    )


def _vision_fallback(file_bytes: bytes, mime: str) -> ExtractionResult:
    """
    LLM vision katmanı — token harcayan tek yol.

    PDF ise MAX_VISION_PAGES kadar sayfa görsele çevrilip gönderilir. Fren
    burada: sayfa başına bir istek ve ~4000 token çıkıyor, sınırsız bırakılırsa
    tek bir kalın tarama günlük kotayı bitirir.

    Import fonksiyon içinde: vision hiç tetiklenmezse LLM istemcisi yüklenmez.
    """
    from app.services.vision import transcribe_image  # noqa: PLC0415

    if mime == "application/pdf":
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        total = len(doc)
        limit = min(total, MAX_VISION_PAGES)
        chunks: list[str] = []

        for page in list(doc)[:limit]:
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            chunks.append(transcribe_image(pix.tobytes("png")))

        doc.close()
        text = "\n\n".join(c for c in chunks if c.strip())
        notes = [f"LLM vision kullanıldı ({limit} sayfa, token harcandı)"]
        skipped = total - limit

        return ExtractionResult(
            text=text,
            method="vision",
            needs_review=not text.strip() or bool(skipped),
            notes=notes + (
                [f"{skipped} sayfa sınır nedeniyle işlenmedi, dosyayı bölerek yükle"]
                if skipped
                else []
            ),
        )

    text = transcribe_image(file_bytes)
    return ExtractionResult(
        text=text,
        method="vision",
        needs_review=not text.strip(),
        notes=["LLM vision kullanıldı (token harcandı)"],
    )