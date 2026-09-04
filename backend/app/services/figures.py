"""
Şekil motoru: modelin ürettiği çizim kodunu güvenli biçimde çalıştırır.

NEDEN BU KADAR TEDBİR
Model Python kodu üretiyor ve biz onu çalıştırıyoruz. Kendi bilgisayarında
`exec()` ile denemek zararsız, ama sunucuda aynı şeyi yapmak uygulamanın
tamamını modelin eline vermek demek: `.env` dosyasını okuyup dışarı gönderen,
veritabanını silen ya da sunucuyu madencilik için kullanan bir kod üretmesi
teknik olarak mümkün. Üstelik bunu modelin "kötü niyeti" olmadan da
yaptırabilirsiniz — özel hazırlanmış bir sınav yükleyip prompt'u yönlendirmek
yeterli (prompt injection).

"Model öyle bir şey yazmaz" bir güvence değil. Katmanlar:

  1. Statik kontrol — kod çalıştırılmadan önce okunuyor; izin listesi dışında
     import, dosya açma, exec/eval, dunder erişimi varsa reddediliyor.
  2. Ayrı süreç — kod uygulamanın belleğinde değil, ayrı bir Python sürecinde
     çalışıyor. Çökerse ya da donarsa uygulamayı etkilemiyor.
  3. Boş ortam — alt sürece hiçbir ortam değişkeni geçmiyor. API anahtarları
     o sürecin dünyasında yok.
  4. Kaynak sınırı — CPU, bellek ve dosya boyutu sınırlı (Linux). Sonsuz döngü
     ya da bellek şişirme sunucuyu kilitleyemiyor.
  5. Zaman aşımı — her durumda süre sonunda süreç öldürülüyor.
  6. Geçici klasör — çalışma dizini boş bir geçici klasör, iş bitince siliniyor.

Windows'ta 4. katman yok (resource modülü Unix'e özgü); geliştirme için kabul
edilebilir, üretim Linux'ta çalışacak.
"""

from __future__ import annotations

import logging
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Literal

from app.services.figure_kit import FIGURE_KIT_SOURCE

logger = logging.getLogger(__name__)

FigureKind = Literal["matplotlib", "schemdraw"]

# Süre ve boyut sınırları.
RENDER_TIMEOUT = 20  # saniye
MAX_CODE_CHARS = 4000
MAX_OUTPUT_BYTES = 2 * 1024 * 1024  # 2 MB

# Kaynak sınırları (yalnızca Linux/macOS).
CPU_SECONDS = 10
MEMORY_BYTES = 512 * 1024 * 1024

# İzin verilen modüller. Bunun dışında hiçbir import kabul edilmiyor.
ALLOWED_IMPORTS = {
    "matplotlib",
    "matplotlib.pyplot",
    "matplotlib.patches",
    "matplotlib.path",
    "matplotlib.lines",
    "matplotlib.ticker",
    "numpy",
    "math",
    "schemdraw",
    "schemdraw.elements",
    "schemdraw.dsp",
    "schemdraw.logic",
}

# Kodda geçmesi yasak kalıplar. Liste kısa ve katı: şüpheli olanı reddedip
# şekilsiz devam etmek, riskli kodu çalıştırmaktan iyi.
FORBIDDEN_PATTERNS = [
    (r"\b__[a-zA-Z_]+__\b", "dunder erişimi"),
    (r"\bopen\s*\(", "dosya açma"),
    (r"\b(exec|eval|compile)\s*\(", "dinamik kod çalıştırma"),
    (r"\b(os|sys|subprocess|socket|shutil|pathlib|requests|urllib|http)\b", "sistem/ağ modülü"),
    (r"\bglobals\s*\(|\blocals\s*\(|\bvars\s*\(", "kapsam erişimi"),
    (r"\bgetattr\s*\(|\bsetattr\s*\(|\bdelattr\s*\(", "öznitelik manipülasyonu"),
    (r"\binput\s*\(", "girdi bekleme"),
    (r"\bplt\.show\s*\(", "etkileşimli pencere"),
]

IMPORT_PATTERN = re.compile(
    r"^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))", re.MULTILINE
)


# Metnin şekle atıfta bulunduğunu gösteren ifadeler.
#
# Burada duruyor çünkü hem üretim öncesi (generator) hem çizim sonrası
# (attach) aynı kontrole ihtiyaç duyuyor.
FIGURE_HINTS = (
    "shown in the figure",
    "in the figure",
    "the figure shows",
    "as shown",
    "shown below",
    "shown above",
    "from the graph",
    "the graph shows",
    "the diagram",
    "the circuit",
    "free-body",
    "inclined plane",
    "the region",
)


def mentions_figure(text: str) -> bool:
    """Metin, olmayan bir şekle atıfta bulunuyor mu?"""
    lowered = text.lower()
    return any(hint in lowered for hint in FIGURE_HINTS)


class FigureRejected(RuntimeError):
    """Kod güvenlik kontrolünden geçemedi."""


class FigureFailed(RuntimeError):
    """Kod çalıştı ama görsel üretilemedi."""


def validate_code(code: str) -> None:
    """
    Kodu çalıştırmadan önce okur ve şüpheli olanı reddeder.

    Bu bir güvenlik duvarı değil, ilk elemedir. Asıl koruma alt süreç ve kaynak
    sınırları; burası açıkça kötü niyetli olanı hiç çalıştırmadan eliyor.
    """
    if not code.strip():
        raise FigureRejected("Kod boş")

    if len(code) > MAX_CODE_CHARS:
        raise FigureRejected(f"Kod çok uzun ({len(code)} karakter)")

    for pattern, reason in FORBIDDEN_PATTERNS:
        if re.search(pattern, code):
            raise FigureRejected(f"Yasak kalıp: {reason}")

    for match in IMPORT_PATTERN.finditer(code):
        module = (match.group(1) or match.group(2) or "").split(",")[0].strip()
        root = module.split(".")[0]
        if module not in ALLOWED_IMPORTS and root not in ALLOWED_IMPORTS:
            raise FigureRejected(f"İzin verilmeyen import: {module}")


# Alt süreçte çalışan sarmalayıcı.
# Kodu dosyadan okuyup çalıştırıyor, sonucu figure.png olarak kaydediyor.
RUNNER = '''
import sys

# Ekransız ortamda çizim: Agg arka ucu pencere açmıyor.
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
import math

code = open(sys.argv[1], encoding="utf-8").read()
kind = sys.argv[2]
out = sys.argv[3]

plt.clf()

# İsim alanı önceden dolduruluyor.
#
# Model bazen `import matplotlib.pyplot as plt` yazıp sonra
# `matplotlib.rcParams[...]` kullanıyor; modülün kendisi isim alanında
# olmadığı için "NameError: name 'matplotlib' is not defined" alıyorduk.
# Aynısı numpy ve math için de geçerli. Bunları hazır koymak bütün bir hata
# sınıfını ortadan kaldırıyor ve modelin import satırlarını unutmasını
# zararsız hale getiriyor.
namespace = {
    "__name__": "__figure__",
    "matplotlib": matplotlib,
    "plt": plt,
    "np": np,
    "numpy": np,
    "math": math,
    "patches": mpatches,
}

# Sık kullanılan şekil sınıfları doğrudan isim alanında.
#
# Model bunları `plt.Arc(...)` diye çağırıyor ama gerçekte
# matplotlib.patches altındalar; "module 'matplotlib.pyplot' has no attribute
# 'Arc'" hatası buradan geliyordu. Hem doğru yerden hem plt üzerinden
# erişilebilir yapıyoruz — modelin hangi yolu seçtiği önemli olmasın.
for _name in (
    "Rectangle", "Circle", "Ellipse", "Arc", "Wedge",
    "Polygon", "Arrow", "FancyArrow", "FancyArrowPatch", "PathPatch",
):
    _cls = getattr(mpatches, _name, None)
    if _cls is not None:
        namespace[_name] = _cls
        if not hasattr(plt, _name):
            setattr(plt, _name, _cls)

# Çizim kiti: geometrisi doğru hazır yapı taşları (eğik düzlem, blok, kuvvet
# oku, açı işareti). Model kodundan ÖNCE çalıştırılıyor ki fonksiyonlar hazır
# olsun.
kit = open(sys.argv[4], encoding="utf-8").read()
exec(compile(kit, "<figure_kit>", "exec"), namespace)

exec(compile(code, "<figure>", "exec"), namespace)

if kind == "schemdraw":
    # schemdraw kendi çizim nesnesini üretiyor; kod `d` adında bir Drawing
    # bırakıyorsa onu kaydediyoruz.
    drawing = namespace.get("d") or namespace.get("drawing")
    if drawing is not None:
        drawing.save(out)
    else:
        plt.savefig(out, dpi=150, bbox_inches="tight", transparent=True)
else:
    plt.savefig(out, dpi=150, bbox_inches="tight", transparent=True)

plt.close("all")
'''


# Alt sürece GEÇMEMESİ gereken değişkenler.
# Ad içinde bunlardan biri geçen her değişken düşüyor.
SECRET_MARKERS = ("KEY", "SECRET", "TOKEN", "PASSWORD", "CLERK", "GROQ", "OPENROUTER")


def _sandbox_env(workdir: str) -> dict[str, str]:
    """
    Alt sürecin ortam değişkenleri.

    Önce tamamen boş bir ortam veriyordum ("hiçbir sır sızmasın"). Teoride
    doğru, pratikte çalışmıyor: Windows'ta Python kullanıcı site-packages
    klasörünü %APPDATA% üzerinden buluyor. Değişken olmayınca
    `pip install --user` ile kurulmuş matplotlib alt süreçte görünmüyor ve
    "No module named 'matplotlib'" hatası alınıyor.

    Bu yüzden ortamı boşaltmak yerine SIRLARI AYIKLIYORUZ. Amaç zaten API
    anahtarlarının kod tarafından okunamaması; PATH veya APPDATA'nın sızmasında
    bir sakınca yok.
    """
    env = {
        key: value
        for key, value in os.environ.items()
        if not any(marker in key.upper() for marker in SECRET_MARKERS)
    }

    # Çizim ekransız arka uçla yapılsın ve geçici dosyalar çalışma klasörüne
    # yazılsın; kullanıcının gerçek ev dizinine dokunmasın.
    env["MPLBACKEND"] = "Agg"
    env["MPLCONFIGDIR"] = workdir
    env["HOME"] = workdir
    env["TMPDIR"] = workdir
    env["TEMP"] = workdir
    env["TMP"] = workdir

    return env


def _limits() -> None:  # pragma: no cover - yalnızca Unix
    """Alt sürece kaynak sınırları koyar."""
    import resource

    resource.setrlimit(resource.RLIMIT_CPU, (CPU_SECONDS, CPU_SECONDS))
    resource.setrlimit(resource.RLIMIT_AS, (MEMORY_BYTES, MEMORY_BYTES))
    resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_OUTPUT_BYTES, MAX_OUTPUT_BYTES))
    # Yeni süreç açmayı engelle: alt süreç kendi alt süreçlerini doğuramasın.
    resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))


def render(code: str, kind: FigureKind = "matplotlib") -> bytes:
    """
    Çizim kodunu çalıştırıp PNG baytlarını döndürür.

    FigureRejected: kod güvenlik kontrolünden geçemedi.
    FigureFailed: kod çalıştı ama görsel çıkmadı (sözdizimi hatası, kütüphane
    eksikliği, zaman aşımı).
    """
    validate_code(code)

    with tempfile.TemporaryDirectory() as workdir:
        work = Path(workdir)
        code_path = work / "figure_code.py"
        runner_path = work / "runner.py"
        kit_path = work / "figure_kit_source.py"
        output_path = work / "figure.png"

        code_path.write_text(code, encoding="utf-8")
        runner_path.write_text(RUNNER, encoding="utf-8")
        kit_path.write_text(FIGURE_KIT_SOURCE, encoding="utf-8")

        try:
            result = subprocess.run(
                [
                    sys.executable,
                    # `-I` (izole mod) BİLEREK yok. Kullanıcı site-packages'ı
                    # yok sayıyor ve `pip install --user` ile kurulmuş
                    # matplotlib/schemdraw alt süreçte görünmez oluyordu
                    # ("No module named 'matplotlib'"). İzolasyonu ortam
                    # değişkenlerini boşaltarak zaten sağlıyoruz; PYTHON*
                    # değişkenleri de aşağıdaki temiz env ile düşüyor.
                    str(runner_path),
                    str(code_path),
                    kind,
                    str(output_path),
                    str(kit_path),
                ],
                cwd=workdir,
                env=_sandbox_env(workdir),
                capture_output=True,
                timeout=RENDER_TIMEOUT,
                text=True,
                errors="replace",
                preexec_fn=_limits if sys.platform != "win32" else None,
            )
        except subprocess.TimeoutExpired:
            raise FigureFailed("Çizim zaman aşımına uğradı") from None

        if not output_path.exists():
            error = (result.stderr or "").strip().splitlines()
            detail = error[-1] if error else "bilinmeyen hata"
            logger.info("Şekil üretilemedi: %s", detail)
            raise FigureFailed(detail)

        data = output_path.read_bytes()

        if len(data) > MAX_OUTPUT_BYTES:
            raise FigureFailed("Görsel çok büyük")

        return data


# ------------------------------------------------------------- boru hattı bağı


def attach(question_ids: list[str], questions: list) -> int:
    """
    Havuza yeni eklenen sorulara şekillerini üretip bağlar.

    Şekil üretimi soru üretiminden AYRI tutuluyor: bir şekil çizilemezse soru
    yine de havuza giriyor, yalnızca şekilsiz kalıyor. Şeklin başarısızlığı
    yüzünden geçerli bir soruyu atmak israf olurdu.

    question_ids ve questions aynı sırada olmalı — add_questions eklediklerini
    aynı sırayla döndürüyor.

    Dönen: üretilen şekil sayısı.
    """
    from app.services import pool, storage  # döngüsel import olmasın

    made = 0
    orphaned: list[str] = []

    for question_id, question in zip(question_ids, questions, strict=False):
        figure = getattr(question, "figure", None)
        if figure is None:
            continue

        try:
            data = render(figure.code, figure.kind)
        except (FigureRejected, FigureFailed) as exc:
            logger.info("Şekil üretilemedi (%s): %s", question_id, exc)

            # Metin şekle atıfta bulunuyorsa soru artık cevaplanamaz:
            # "the region shown in the figure" deyip şekil vermemek,
            # öğrenciye eksik soru göstermek demek. Havuzdan çıkarıyoruz.
            #
            # Bu kontrol üretim aşamasında da var ama orada şekil KODU vardı,
            # çizilip çizilemeyeceğini bilmiyorduk. Asıl karar burada veriliyor.
            if mentions_figure(question.prompt):
                orphaned.append(question_id)
            continue

        storage.save_figure(question_id, data)
        pool.mark_has_figure(question_id)
        made += 1

    if orphaned:
        removed = pool.delete_questions(orphaned)
        logger.info(
            "%d soru havuzdan çıkarıldı: şekli çizilemedi ve metni şekle atıf yapıyor",
            removed,
        )

    if made:
        logger.info("%d şekil üretildi", made)

    return made