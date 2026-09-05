"""
Uygulama ayarları.

Neden os.environ.get değil?
`os.environ.get("API_KEY")` anahtar yoksa None döner ve uygulama açılır; hata
ancak ilk LLM çağrısında, anlamsız bir mesajla ortaya çıkar. Buradaki Settings
sınıfı ise eksik/yanlış tipte bir değer bulduğunda daha açılışta patlar ve neyin
eksik olduğunu söyler. Buna "fail fast" deniyor: hatayı üretimde değil,
başlatma anında görmek istiyoruz.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import ValidationInfo, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# app/config.py -> app/ -> proje kökü
PROJECT_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Mutlak yol: uvicorn'u veya worker'ı hangi klasörden başlatırsan başlat
        # .env hep bulunur.
        env_file=PROJECT_ROOT / ".env",
        # utf-8-sig, Notepad'in eklediği görünmez BOM işaretini yutar.
        env_file_encoding="utf-8-sig",
        extra="ignore",
        # Liste alanlarını pydantic'in kendisi JSON olarak çözmesin.
        #
        # Varsayılan davranışta `ALLOWED_ORIGINS=` gibi BOŞ bir satır
        # json.loads("") çağrısına düşüyor ve uygulama hiç açılmadan
        # çöküyordu — üstelik hata mesajı sorunun .env'deki boş bir satır
        # olduğunu söylemiyordu.
        #
        # Kapatınca değerler ham metin olarak geliyor ve aşağıdaki
        # parse_list doğrulayıcısı işi devralıyor: boş satır, JSON dizisi ve
        # virgüllü yazım, üçü de çalışıyor.
        enable_decoding=False,
    )

    # --- Sağlayıcı anahtarları ---
    # Sadece Groq zorunlu. Diğerleri boşsa o sağlayıcı zincirde sessizce atlanır,
    # yani tek anahtarla da çalışır; üç anahtarla kapasite katlanır.
    groq_api_key: str
    openrouter_api_key: str = ""
    google_api_key: str = ""

    # --- Zincirler ---
    # Biçim: "sağlayıcı:model". Sırayla denenir, ilk geçerli yanıt kullanılır.
    #
    # Sıralama mantığı: Groq çok hızlı ama dakikalık limiti dar (6k TPM),
    # OpenRouter'ın günlük kotası ayrı bir havuz, Google Flash-Lite'ın günlük
    # kotası en geniş. Biri 429 verince otomatik sıradakine düşülüyor ve o
    # sağlayıcı bir süre soğumaya alınıyor.
    #
    # NOT: Model id'leri sık değişiyor, özellikle OpenRouter'ın ücretsiz listesi
    # haber vermeden rotasyona giriyor. "model not found" alırsan sağlayıcının
    # model sayfasından güncel id'yi al.
    generation_chain: list[str] = [
        "groq:qwen/qwen3.8-27b",
        # "-latest" takma adları sürüm rotasyonundan etkilenmiyor: Google eski
        # sürümü emekliye ayırdığında bu id kendiliğinden yenisini gösteriyor.
        "google:models/gemini-flash-lite-latest",
        "openrouter:nvidia/nemotron-3.5-lightning:free",
        "openrouter:z-ai/glm-5.2:free",
    ]
    # Hakem üretenden farklı aileden olmalı: bir model kendi hatasını zor görür.
    judge_chain: list[str] = [
        "groq:openai/gpt-oss-120b",
        "google:models/gemini-flash-latest",
        "openrouter:nvidia/nemotron-3-super-120b-a12b:free",
    ]
    solver_chain: list[str] = [
        "groq:qwen/qwen3.8-27b",
        "google:models/gemini-flash-latest",
        "openrouter:minimax/minimax-m3:free",
    ]
    # Vision için görsel destekleyen model şart.
    # OpenRouter'ın ücretsiz listesinde şu an tek bir VL modeli bile yok
    # (qwen3-vl ailesinin hepsi ücretli), o yüzden ücretsiz görsel işleme
    # pratikte Google'a bağlı. "omni" modeli çok kipli olduğu için yedek.
    vision_chain: list[str] = [
        "google:models/gemini-flash-lite-latest",
        "google:models/gemini-flash-latest",
        "openrouter:nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    ]

    # --- Token bütçesi ---
    # Akıl yürüten modellerde bu bütçe görünmeyen "düşünme" token'larını da
    # kapsıyor. Dar tutarsan model cevabı tamamlayamadan kesiliyor ve sağlayıcı
    # "json_validate_failed" hatası veriyor.
    # Şekil kodu çıktıyı belirgin şekilde uzatıyor: bir matplotlib bloğu tek
    # başına 300-500 token. Beş soruluk bir partide iki şekil varsa 2500 token
    # yetmiyor, model JSON'u tamamlayamadan kesiliyor ve sağlayıcı
    # "Failed to generate JSON" hatası veriyor.
    generation_max_tokens: int = 5000
    judge_max_tokens: int = 3000
    solver_max_tokens: int = 3000
    vision_max_tokens: int = 4000

    # --- Akıl yürütme (yalnızca Groq) ---
    # Üretim ve etiketlemede düşünmeye ihtiyaç yok: hız ve token tasarrufu için
    # kapalı. Denetim ise doğruluk işi, orada bir miktar düşünme faydalı.
    generation_reasoning: str = "none"
    judge_reasoning: str = "low"
    solver_reasoning: str = "none"

    # --- Marka ---
    # PDF çıktısının altbilgisinde geçiyor. Frontend'in lib/brand.ts dosyasıyla
    # aynı değeri taşımalı.
    #
    # Marka adı iki yerde: burada (sunucu PDF üretiyor) ve lib/brand.ts'te
    # (tarayıcı sayfayı çiziyor). Tek yere indirmenin yolu backend'in adı bir
    # uç noktadan servis etmesi, ama her sayfa yüklemesinde bir istek daha
    # atmaya değmiyor — ad yılda bir değişen bir şey.
    brand_name: str = "Askesis"

    # --- OCR ---
    # Sınavlar ağırlıklı İngilizce. Tesseract'a iki dil birden vermek doğruluğu
    # düşürüyor (her kelimeyi iki sözlükte arıyor), o yüzden tek dil.
    # Türkçe sınav yüklenirse "tur+eng" yapılabilir.
    ocr_lang: str = "eng"
    # Windows installer'ı Tesseract'ı PATH'e eklemiyor. Boş bırakılırsa kod
    # bilinen kurulum yollarını kendisi tarıyor; farklı yere kurduysan
    # .env'den TESSERACT_CMD ile tam yolu ver.
    tesseract_cmd: str = ""

    # --- Depolama ---
    chroma_path: str = "./data/chroma"
    # Yüklenen sınav dosyaları. Metni çıkarıp dosyayı atmak yerine saklıyoruz:
    # admin panelinde önizleme yapılabilsin ve yanlış yüklenen dosya
    # silinebilsin diye.
    uploads_path: str = "./data/uploads"
    sqlite_path: str = "./data/pool.db"

    # --- Krediler ---
    # Yeni kullanıcıya verilen ücretsiz soru hakkı. Denemeye yetecek kadar
    # (dört-beş küçük sınav), bedavaya kullanılmayacak kadar.
    free_credits: int = 20

    # --- Havuz ---
    # Havuz hedefi: bir kombinasyonda bu sayıya ulaşılınca worker o dersi
    # doldurmayı bırakıyor.
    #
    # 0 = SINIRSIZ. Worker üretebildiği sürece üretmeye devam eder; yalnızca
    # yeni soru çıkmadığında (referanslar tükendiğinde) geri çekilir.
    # Yayın öncesi havuzu doldurmak için doğru ayar bu.
    pool_min_size: int = 0
    # Bir üretim çağrısında istenecek soru sayısı.
    pool_batch_size: int = 5
    # Worker turları arası süre (dakika). Kısa aralık havuzu hızlı doldurur ama
    # dakikalık token limitine yaklaşır; uzun aralık yükü güne yayar.
    # 10 dakika = günde ~144 tur = ~700 soru üretim kapasitesi.
    refill_interval_minutes: int = 10
    # Bir kombinasyon kaç boş tur verdikten SONRA dinlendirilmeye başlanacak.
    # 0 = ilk boş turda dur. 2 = iki boş tura göz yum, üçüncüde geri çekil.
    #
    # Neden tolerans var: bir tur boş dönmesi havuzun doyduğu anlamına
    # gelmiyor. Referanslar rastgele seçildiği için o tur şanssız bir üçlü
    # gelmiş olabilir; sonraki tur farklı referanslarla yeni soru üretebilir.
    refill_grace_rounds: int = 2

    # --- Kimlik doğrulama (Clerk) ---
    # JWKS: Clerk'in genel anahtarlarının yayınlandığı adres.
    # Frontend API URL'inin sonuna /.well-known/jwks.json eklenmiş hali.
    # Clerk Dashboard → API keys sayfasında bulunuyor.
    clerk_jwks_url: str = ""

    # Token'ı üretmesine izin verdiğimiz origin'ler (azp iddiası).
    # Boş bırakılırsa kontrol atlanır; üretimde mutlaka doldur, yoksa başka bir
    # Clerk uygulamasından alınmış geçerli token da kabul edilir.
    clerk_authorized_parties: list[str] = ["http://localhost:3000"]

    # Sınav yükleyebilecek Clerk kullanıcı id'leri (user_xxx biçiminde).
    clerk_admin_user_ids: list[str] = []

    # Admin panelinde kullanıcı adı ve e-postasını göstermek için.
    # Clerk Dashboard → API keys → Secret key (sk_ ile başlıyor).
    # Boş bırakılırsa panel yalnızca kimlikleri gösterir, hata vermez.
    clerk_secret_key: str = ""

    # ⚠️ true iken JWT doğrulaması TAMAMEN atlanır ve X-User-Id başlığına
    # güvenilir. Sadece frontend hazır olmadan API denemek için.
    auth_dev_mode: bool = False

    # --- CORS ---
    # Next.js frontend'in adresi. Üretimde kendi domainini ekleyeceksin.
    # Tarayıcıdan gelen isteklerde izin verilen kaynaklar.
    #
    # Üretimde gerçek alan adını EKLEMEK ZORUNLU, aksi halde site backend'e
    # ulaşamaz. Localhost listede kalabilir; geliştirme yaparken gerekiyor ve
    # üretim sunucusunda kimse localhost:3000'den istek atamaz.
    #
    #   ALLOWED_ORIGINS=["https://askesis.com","https://www.askesis.com"]
    #
    # Asla ["*"] yapma: kimlik doğrulamalı isteklerde her siteye açık kapı
    # demek.
    allowed_origins: list[str] = ["http://localhost:3000"]

    # --- Loglama ---
    log_dir: str = "./logs"
    log_level: str = "INFO"


    @field_validator(
        "allowed_origins",
        "clerk_authorized_parties",
        "clerk_admin_user_ids",
        mode="before",
    )
    @classmethod
    def parse_list(cls, value: object, info: ValidationInfo) -> object:
        """
        Liste alanlarını .env'den okurken esnek davranır.

        Pydantic bu alanları JSON olarak ayrıştırıyor. `.env` içinde satır
        boş bırakılırsa ("ALLOWED_ORIGINS=") ayrıştırma çöküyor ve uygulama
        hiç açılmıyor — boş bırakmak varsayılana dönmek anlamına gelmiyordu.

        Üç yazım da kabul ediliyor:
            ALLOWED_ORIGINS=                       → varsayılan
            ALLOWED_ORIGINS=["https://a","https://b"]
            ALLOWED_ORIGINS=https://a,https://b

        Sonuncusu elle yazarken en kolayı: köşeli parantez ve tırnak
        unutmak kolay, virgül unutmak zor.
        """
        if not isinstance(value, str):
            return value

        text = value.strip()

        if not text:
            # Boş satır: alanın kendi varsayılanına dönüyoruz.
            # None döndürmek işe yaramıyor — pydantic onu "liste değil" diye
            # reddediyor, varsayılana geri düşmüyor.
            field = cls.model_fields.get(info.field_name or "")
            return field.get_default() if field else []

        if text.startswith("["):
            # JSON dizisi: otomatik çözme kapalı olduğu için burada çözüyoruz.
            import json

            try:
                return json.loads(text)
            except json.JSONDecodeError:
                # Bozuk JSON'da uygulamayı çökertmek yerine virgüllü yazım
                # gibi ayrıştırmayı deniyoruz; tırnak veya köşeli parantez
                # unutmak sık yapılan bir hata.
                text = text.strip("[]")

        return [item.strip().strip('"\'') for item in text.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    """
    lru_cache sayesinde Settings yalnızca bir kez okunur; sonraki çağrılar aynı
    nesneyi döndürür. Fonksiyon olması testte override etmeyi kolaylaştırıyor.
    """
    return Settings()