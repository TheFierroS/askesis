"""
Havuzdaki bozuk LaTeX'i tarar ve onarır.

Neden gerekli?
llm.py'daki koruma katmanı bundan sonra üretilecek soruları kurtarıyor, ama
havuzda zaten duran sorular bozuk kaldı. Onları silmek en kolayı; her biri
gerçek token'a mal olduğu için onarmak daha doğru.

Üç bozulma sınıfı arıyor:

  cr        Ayrıştırma sırasında `\\right` -> CR + "ight" olmuş. Ekranda
            "ight\\}" görünüyor. Onarılabilir.

  rowsep    Matris içinde satır ayracı `\\\\` yerine tek `\\` kalmış.
            Satırlar tek satıra çöküyor. Onarılabilir.

  nobs      `mathbb`, `frac` gibi komutların ters bölüsü hiç yok. Bu bir
            kaçış sorunu değil, modelin yazım hatası. Otomatik onarmıyoruz:
            metnin neresinde komut neresi düz metin olduğunu güvenle
            ayırt edemeyiz. Sadece raporluyor, elle karar ver.

Kullanım:
    python -m scripts.repair_questions              # sadece rapor
    python -m scripts.repair_questions --apply      # onar ve yaz
    python -m scripts.repair_questions --apply --limit 5
"""

from __future__ import annotations

import argparse
import re
import sys

from app.services.llm import _restore_latex_controls, _restore_row_separators
from app.services.pool import _connect

# Ters bölüsü düşmüş, sık kullanılan komutlar. Yalnızca RAPOR için —
# "bmatrix" gibi bir kelimenin metinde düz geçme ihtimali düşük ama sıfır
# değil, o yüzden otomatik onarım yapmıyoruz.
# Süslü parantez de dışlanıyor: `\begin{bmatrix}` içindeki "bmatrix" ters
# bölüsüz görünüyor ama doğru — orası ortam adı, komut değil. Matris ortam
# adlarını listeden tamamen çıkardım, neredeyse her zaman parantez içindeler.
_MISSING_BACKSLASH = re.compile(
    r"(?<![\\A-Za-z{])(mathbb|mathbf|mathrm|frac|sqrt|times|cdot"
    r"|alpha|beta|theta|lambda|infty|forall|exists)\b"
)

# Matris ortamında boşluktan önce gelen TEK ters bölü.
_LONE_ROWSEP = re.compile(
    r"\\begin\{(matrix|bmatrix|pmatrix|vmatrix|Vmatrix|smallmatrix"
    r"|array|cases|aligned|split|gathered)\}.*?\\end\{\1\}",
    re.DOTALL,
)


def _has_lone_rowsep(text: str) -> bool:
    for block in _LONE_ROWSEP.finditer(text):
        if re.search(r"(?<!\\)\\(?=\s)", block.group(0)):
            return True
    return False


def _classify(text: str) -> list[str]:
    """Metindeki bozulma sınıflarını döndürür."""
    problems = []
    if "\x0d" in text or "\x0c" in text or "\x08" in text or "\x0b" in text:
        problems.append("cr")
    if _has_lone_rowsep(text):
        problems.append("rowsep")
    if _MISSING_BACKSLASH.search(text):
        problems.append("nobs")
    return problems


def _repair(text: str) -> str:
    """cr ve rowsep sınıflarını onarır. nobs'a dokunmuyor."""
    return _restore_row_separators(_restore_latex_controls(text))


def _columns(connection, table: str) -> set[str]:
    return {
        row["name"] for row in connection.execute(f"PRAGMA table_info({table})")
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Onarımı veritabanına yaz. Verilmezse yalnızca rapor.",
    )
    parser.add_argument(
        "--limit", type=int, default=0, help="Kaç bozuk kayıt gösterilsin (0 = hepsi)"
    )
    parser.add_argument(
        "--table", default="questions", help="Tablo adı (varsayılan: questions)"
    )
    args = parser.parse_args()

    with _connect() as connection:
        columns = _columns(connection, args.table)
        if not columns:
            print(f"'{args.table}' tablosu bulunamadı.", file=sys.stderr)
            return 1
        if "prompt" not in columns or "id" not in columns:
            print(f"'{args.table}' içinde id/prompt sütunu yok: {sorted(columns)}")
            return 1

        # Çözüm metni de aynı yoldan geçiyor, varsa onu da tarayalım.
        text_columns = [c for c in ("prompt", "solution") if c in columns]
        selected = ", ".join(["id", *text_columns])

        rows = connection.execute(f"SELECT {selected} FROM {args.table}").fetchall()

        counts = {"cr": 0, "rowsep": 0, "nobs": 0}
        repaired = 0
        shown = 0

        for row in rows:
            updates: dict[str, str] = {}
            row_problems: set[str] = set()

            for column in text_columns:
                text = row[column]
                if not text:
                    continue

                problems = _classify(text)
                if not problems:
                    continue

                row_problems.update(problems)
                fixed = _repair(text)
                if fixed != text:
                    updates[column] = fixed

            if not row_problems:
                continue

            for problem in row_problems:
                counts[problem] += 1

            if args.limit == 0 or shown < args.limit:
                shown += 1
                print("=" * 72)
                print(f"id       : {row['id']}")
                print(f"sorunlar : {', '.join(sorted(row_problems))}")
                snippet = (row[text_columns[0]] or "")[:200]
                print(f"önce     : {snippet!r}")
                if updates.get(text_columns[0]):
                    print(f"sonra    : {updates[text_columns[0]][:200]!r}")
                elif "nobs" in row_problems:
                    print("sonra    : (otomatik onarım yok — elle bak)")

            if args.apply and updates:
                assignments = ", ".join(f"{c} = ?" for c in updates)
                connection.execute(
                    f"UPDATE {args.table} SET {assignments} WHERE id = ?",
                    (*updates.values(), row["id"]),
                )
                repaired += 1

    print("=" * 72)
    print(f"Taranan          : {len(rows)}")
    print(f"CR bozulması     : {counts['cr']}")
    print(f"Satır ayracı     : {counts['rowsep']}")
    print(f"Eksik ters bölü  : {counts['nobs']}  (elle bakılmalı)")

    if args.apply:
        print(f"Onarılıp yazıldı : {repaired}")
    else:
        print("\nHiçbir şey yazılmadı. Onarmak için --apply ekle.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())