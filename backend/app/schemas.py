"""
Şemalar: LLM çıktısının ve API gövdelerinin sözleşmesi.

Neden gerekli?
Eski kodda `data.get("questions", [])` vardı. Model şemadan saptığında bu satır
sessizce boş liste döndürüyor, uygulama "hata yok" sanıp devam ediyordu. Ayrıca
5 soru istenip 3 geldiğinde kimse fark etmiyordu.

Pydantic ile sözleşmeyi tek yerde tanımlıyoruz: gelen veri uymuyorsa
ValidationError fırlar, hangi alanın neden geçersiz olduğunu söyler ve fallback
zincirindeki bir sonraki modele geçebiliriz.
"""

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Difficulty = Literal["easy", "medium", "hard"]
Verdict = Literal["ONAY", "RED"]


# ---------------------------------------------------------------- LLM çıktıları


class FigureSpec(BaseModel):
    """
    Soruya eşlik eden şekil.

    Model görseli kendisi çizmiyor, çizim KODU üretiyor; biz o kodu kum
    havuzunda çalıştırıp PNG'ye çeviriyoruz. Böylece şekil gerçekten
    matematiksel olarak doğru oluyor (fonksiyon gerçekten çiziliyor, devre
    gerçekten kuruluyor) — görsel üreten bir modelin "yaklaşık doğru" çıktısı
    değil.
    """

    kind: Literal["matplotlib", "schemdraw"] = "matplotlib"
    code: str = Field(min_length=10, max_length=4000)


class GeneratedQuestion(BaseModel):
    """Modelin ürettiği tek bir soru."""

    prompt: str = Field(min_length=10)
    topic: str = ""
    difficulty: Difficulty = "medium"
    # Yalnızca soru şekilsiz anlaşılamıyorsa dolu geliyor.
    figure: FigureSpec | None = None

    @field_validator("prompt")
    @classmethod
    def fix_display_delimiters(cls, v: str) -> str:
        """
        Blok ortamı içeren SATIR İÇİ matematiği blok matematiğe çevirir.

        Model bazen $\\begin{array}...\\end{array}$ yazıyor — tek dolar satır içi
        demek, oysa array/cases blok ortamı. KaTeX çizemiyor.

        Kritik nokta: dönüşüm DENGELİ olmalı. Önceki sürüm açılış ve kapanış
        dolarlarını ayrı ayrı ele alıyordu; model doğru yazdığında
        ($A = \\begin{bmatrix}...\\end{bmatrix}$ gibi) sadece kapanışı $$ yapıp
        ifadeyi bozuyordu. Şimdi tüm satır içi bloğu yakalayıp ikisini birden
        değiştiriyoruz.
        """
        envs = "array|aligned|cases|split|gathered|matrix|bmatrix|pmatrix|vmatrix"
        # (?<!\$)\$ ... \$(?!\$)  → yalnızca TEK dolarla sınırlanmış bloklar.
        # [^$]* → açılıştan \begin'e kadar başka dolar olmasın (yanlış eşleşme).
        pattern = re.compile(
            rf"(?<!\$)\$([^$]*\\begin\{{(?:{envs})\}}.*?\\end\{{(?:{envs})\}}[^$]*)\$(?!\$)",
            re.DOTALL,
        )
        v = pattern.sub(r"$$\1$$", v)

        # Tek dolarla açılıp çift dolarla kapanan dengesiz ifadeler.
        # Bunlar önceki (hatalı) onarıcının havuzda bıraktığı kayıtlar.
        v = re.sub(
            rf"(?<!\$)\$([^$]*\\begin\{{(?:{envs})\}}.*?\\end\{{(?:{envs})\}}[^$]*)\$\$",
            r"$$\1$$",
            v,
            flags=re.DOTALL,
        )

        # Emniyet: üç veya daha fazla art arda dolar hiçbir zaman geçerli değil.
        v = re.sub(r"\${3,}", "$$", v)
        return v

    @field_validator("prompt")
    @classmethod
    def strip_latex_environments(cls, v: str) -> str:
        """
        Prompt'ta yasakladığımız halde model bazen \\begin{enumerate} yazıyor.
        Burada reddetmek yerine temizliyoruz: soru içeriği doğruysa sırf format
        yüzünden yeniden üretim yapmak boşa token.
        """
        banned = ("\\begin{enumerate}", "\\begin{itemize}", "\\begin{align}")
        cleaned = v
        for token in banned:
            cleaned = cleaned.replace(token, "")
        cleaned = (
            cleaned.replace("\\end{enumerate}", "")
            .replace("\\end{itemize}", "")
            .replace("\\end{align}", "")
            .replace("\\item", "\n-")
        )
        return cleaned.strip()


class GenerationResult(BaseModel):
    """generate_questions çağrısının tam yanıtı."""

    questions: list[GeneratedQuestion] = Field(min_length=1)


class TopicLabel(BaseModel):
    index: int = Field(ge=0)
    topic: str = Field(min_length=1, max_length=60)


class TopicLabelResult(BaseModel):
    labels: list[TopicLabel] = Field(min_length=1)


class QuestionVerdict(BaseModel):
    """
    Hakemin tek bir soru için kararı.

    alias kullanımı: prompt Türkçe anahtar istiyor ("durum", "gerekce") ama
    Python tarafında İngilizce alan adıyla çalışmak daha rahat. Field(alias=...)
    ikisini birbirine bağlıyor; parse ederken populate_by_name sayesinde her iki
    isim de kabul ediliyor.
    """

    model_config = {"populate_by_name": True}

    index: int = Field(ge=0)
    status: Verdict = Field(alias="durum")
    reason: str = Field(alias="gerekce", default="")

    @property
    def approved(self) -> bool:
        return self.status == "ONAY"


class JudgeResult(BaseModel):
    verdicts: list[QuestionVerdict] = Field(min_length=1)


class SolutionVerdict(BaseModel):
    model_config = {"populate_by_name": True}

    status: Verdict = Field(alias="durum")
    reason: str = Field(alias="gerekce", default="")

    @property
    def approved(self) -> bool:
        return self.status == "ONAY"


# ------------------------------------------------------------------ API gövdeleri


class ExamRequest(BaseModel):
    """Frontend'den gelen soru üretme isteği."""

    department: str = Field(min_length=1)
    course: str = Field(min_length=1)
    exam_type: str = Field(min_length=1)
    # Frontend'deki slider 1-10 arası; sınırı burada da uyguluyoruz ki
    # birisi doğrudan API'ye 500 göndermesin.
    num_questions: int = Field(default=5, ge=1, le=10)


class QuestionOut(BaseModel):
    """Frontend'e dönen soru. Çözüm ayrı endpoint'ten geliyor."""

    id: str
    prompt: str
    topic: str = ""
    difficulty: Difficulty = "medium"
    # Şekil varsa frontend /api/questions/{id}/figure adresinden çekiyor.
    has_figure: bool = False


class ExamResponse(BaseModel):
    questions: list[QuestionOut]
    # Havuzdan mı geldi, anlık mı üretildi — frontend'de loader'ı ve
    # log'ları buna göre yönetebiliriz.
    source: Literal["pool", "generated"]
    # Kaç soru istenmişti. Referanslar sınırlıysa daha az soru dönebiliyor;
    # frontend bunu karşılaştırıp kullanıcıya açıklama gösteriyor.
    requested: int
    # Geçmişe kaydedilen sınavın id'si. Frontend listeyi buna göre tazeliyor.
    exam_id: str
    # İşlem sonrası kalan soru hakkı — frontend üst barı buna göre güncelliyor.
    credits_left: int


class ExamPdfRequest(BaseModel):
    """PDF üretme isteği. Sorular id ile geliyor, metin değil —
    istemcinin gönderdiği metne güvenmek, başkasının sunucusunda istediği
    içeriği bastırabilmek demek olurdu."""

    question_ids: list[str] = Field(min_length=1, max_length=20)
    course: str = Field(min_length=1)
    exam_type: str = Field(min_length=1)


class ExamSummaryOut(BaseModel):
    """Geçmiş listesindeki bir satır. Soruları içermiyor — liste hafif kalsın."""

    id: str
    department: str
    course: str
    exam_type: str
    created_at: str
    question_count: int


class ExamDetailOut(BaseModel):
    """Geçmişten açılan sınav: özet + sorular."""

    exam: ExamSummaryOut
    questions: list[QuestionOut]


class CreditBalanceOut(BaseModel):
    balance: int


class CreditAccountOut(BaseModel):
    """Admin panelindeki kullanıcı satırı."""

    user_id: str
    # Clerk'ten geliyor; anahtar tanımlı değilse boş kalıyor.
    name: str = ""
    email: str = ""
    balance: int
    used_total: int
    created_at: str
    updated_at: str


class GrantCreditsRequest(BaseModel):
    user_id: str = Field(min_length=1)
    # Negatif değer düzeltme için; bakiye eksiye düşmüyor.
    amount: int = Field(ge=-1000, le=10000)
    reason: str = Field(default="admin grant", max_length=200)


class SolutionResponse(BaseModel):
    question_id: str
    solution: str


class IngestResponse(BaseModel):
    document_id: str
    chunk_count: int
    # Metnin hangi katmandan çıktığı: digital / ocr / vision / plain.
    # Admin panelinde gösteriyoruz — vision kullanıldıysa token harcanmış
    # demektir, bunu bilmek faydalı.
    method: str = ""
    # Otomatik çıkarma şüpheliyse admin'in dosyayı gözden geçirmesi gerekiyor.
    needs_review: bool = False
    notes: list[str] = []


class DocumentOut(BaseModel):
    """Admin panelindeki yüklenmiş sınav satırı."""

    document_id: str
    department: str
    course: str
    exam_type: str
    source_name: str
    uploaded_at: str
    question_count: int
    has_file: bool


class PoolStatOut(BaseModel):
    """Havuz durumu: hangi ders için kaç soru hazır."""

    department: str
    course: str
    exam_type: str
    total: int
    oldest: str | None = None
    newest: str | None = None