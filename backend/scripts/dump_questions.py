"""
Havuzdaki soruların HAM metnini gösterir.

Ekran görüntüsünden teşhis yapılamıyor: sorunun ters bölülerde mi, dolar
işaretlerinde mi, yoksa render tarafında mı olduğunu ancak saklanan metnin
kendisine bakarak anlayabiliyoruz.

Kullanım (proje kökünden):
    python -m scripts.dump_questions                # hepsi
    python -m scripts.dump_questions --search cases # metinde geçen
    python -m scripts.dump_questions --broken       # sadece şüpheliler
"""

from __future__ import annotations

import argparse
import re
import sys

from app.services.pool import _connect


def dollar_balance(text: str) -> str:
    """
    Dolar işaretlerinin dengeli olup olmadığını söyler.

    Önce $$ çiftlerini sayıyoruz, kalan tek dolarlar satır içi matematik
    sınırlayıcıları. İkisi de çift sayıda olmalı; tek sayı, bir sınırlayıcının
    açık kaldığı ve sonrasındaki her şeyin matematik sanıldığı anlamına gelir.
    """
    display = len(re.findall(r"\$\$", text))
    inline = len(re.sub(r"\$\$", "", text).split("$")) - 1

    problems = []
    if display % 2:
        problems.append(f"$$ tek sayıda ({display})")
    if inline % 2:
        problems.append(f"tek $ sayısı tek ({inline})")

    return ", ".join(problems) if problems else "dengeli"


def looks_broken(text: str) -> bool:
    if dollar_balance(text) != "dengeli":
        return True
    # Matematik sınırlayıcısı dışında kalmış ortam etiketi
    for match in re.finditer(r"\\(begin|end)\{", text):
        before = text[: match.start()]
        # O noktaya kadar tek sayıda dolar varsa matematiğin içindeyiz
        if (before.count("$") - 2 * before.count("$$")) % 2 == 0 and "$$" not in before[-40:]:
            return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--search", default="", help="metinde geçen ifade")
    parser.add_argument("--broken", action="store_true", help="sadece şüpheliler")
    parser.add_argument("--limit", type=int, default=50)
    args = parser.parse_args()

    with _connect() as connection:
        rows = connection.execute(
            "SELECT id, topic, prompt FROM questions ORDER BY created_at DESC LIMIT ?",
            (args.limit,),
        ).fetchall()

    shown = 0
    for row in rows:
        prompt = row["prompt"]

        if args.search and args.search.lower() not in prompt.lower():
            continue
        if args.broken and not looks_broken(prompt):
            continue

        shown += 1
        print("=" * 72)
        print(f"id     : {row['id']}")
        print(f"konu   : {row['topic']}")
        print(f"dolar  : {dollar_balance(prompt)}")
        print("ham metin:")
        print(repr(prompt))
        print()

    print(f"\n{shown} soru gösterildi (toplam {len(rows)} incelendi).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
