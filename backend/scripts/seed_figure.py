"""
Şekil motorunu uçtan uca denemek için örnek soru ekler.

Neden ayrı script?
Tek satırlık `python -c` komutu PowerShell'de çalışmıyor: kabuk `$` işaretini
kendi değişkeni sanıp metni bozuyor, LaTeX ifadeleri de tam olarak `$` ile
yazılıyor. Dosyaya yazınca kabuk araya girmiyor.

Kullanım (proje kökünden):
    python -m scripts.seed_figure
    python -m scripts.seed_figure --course "Calculus I" --exam-type Midterm

Eklediği soru gerçek üretimden gelmiş gibi havuza giriyor; dashboard'da o
dersi seçip çektiğinde şekliyle birlikte görünmesi gerekiyor.
"""

from __future__ import annotations

import argparse
import logging
import sys

from app.schemas import FigureSpec, GeneratedQuestion
from app.services import figures, pool

logging.basicConfig(level=logging.INFO, format="%(levelname)-7s %(name)s: %(message)s")

# --- Örnek 1: fonksiyon grafiği (matplotlib) ---
CURVE_CODE = '''
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(-3, 3, 400)
y = x**3 - 3*x

fig, ax = plt.subplots(figsize=(5, 3.2))
ax.plot(x, y, linewidth=2)
ax.axhline(0, color="black", linewidth=0.8)
ax.axvline(0, color="black", linewidth=0.8)
ax.grid(alpha=0.3, linestyle="--")
ax.set_xlabel(r"$x$")
ax.set_ylabel(r"$f(x)$")
'''

# --- Örnek 2: integral bölgesi (matplotlib, dolgu) ---
REGION_CODE = '''
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 2, 300)
upper = 4 - x**2
lower = x

fig, ax = plt.subplots(figsize=(5, 3.4))
ax.plot(x, upper, label=r"$y = 4 - x^2$", linewidth=2)
ax.plot(x, lower, label=r"$y = x$", linewidth=2)
ax.fill_between(x, lower, upper, where=(upper >= lower), alpha=0.25)
ax.set_xlabel(r"$x$")
ax.set_ylabel(r"$y$")
ax.grid(alpha=0.3, linestyle="--")
ax.legend()
'''

SAMPLES = [
    (
        "The graph shows $f(x) = x^3 - 3x$.\n\n"
        "(a) Find the coordinates of the local maximum and local minimum.\n"
        "(b) State the intervals on which $f$ is increasing.",
        "curve sketching",
        CURVE_CODE,
    ),
    (
        "The shaded region $R$ is bounded by $y = 4 - x^2$ and $y = x$ "
        "for $0 \\le x \\le 2$.\n\n"
        "(a) Find the points of intersection.\n"
        "(b) Compute the area of $R$.",
        "area between curves",
        REGION_CODE,
    ),
]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--department", default="Computer Engineering")
    parser.add_argument("--course", default="Calculus I")
    parser.add_argument("--exam-type", default="Midterm")
    args = parser.parse_args()

    questions = [
        GeneratedQuestion(
            prompt=prompt,
            topic=topic,
            difficulty="medium",
            figure=FigureSpec(kind="matplotlib", code=code),
        )
        for prompt, topic, code in SAMPLES
    ]

    ids = pool.add_questions(
        questions,
        department=args.department,
        course=args.course,
        exam_type=args.exam_type,
    )

    if not ids:
        print(
            "Havuza eklenmedi — bu sorular zaten kayıtlı olabilir.\n"
            "Tekrar denemek için havuzdaki kopyaları silmen ya da metni "
            "değiştirmen gerekiyor."
        )
        return 1

    print(f"{len(ids)} soru havuza eklendi.")
    made = figures.attach(ids, questions)
    print(f"{made} şekil üretildi.")

    if made < len(ids):
        print(
            "Bazı şekiller üretilemedi. Sebebi loglarda: kod güvenlik "
            "kontrolünden geçmemiş ya da çizim hata vermiş olabilir."
        )

    print(
        f"\nŞimdi dashboard'da {args.course} · {args.exam_type} seçip "
        "soru üret; şekiller kartın içinde görünmeli."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())