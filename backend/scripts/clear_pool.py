"""
Havuzdan soru siler.

Neden ayrı script?
`python -c "..."` içinde SQL yazmak Windows'ta sürekli tırnak sorunu çıkarıyor:
PowerShell iç tırnakları ve `$` işaretini kendi sözdizimi sanıyor. Dosyada
böyle bir sorun yok.

Kullanım (proje kökünden):
    python -m scripts.clear_pool --course "Calculus I"          # önizleme
    python -m scripts.clear_pool --course "Calculus I" --apply  # sil
    python -m scripts.clear_pool --all --apply                  # havuzu boşalt

Silinen sorular geçmiş sınavlardan da düşüyor (exam_questions için CASCADE).
Referanslara (Chroma) DOKUNULMUYOR — onlar admin panelinden yönetiliyor.
"""

from __future__ import annotations

import argparse
import sys

from app.services import storage
from app.services.pool import _connect


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--course", default="", help="Yalnızca bu ders")
    parser.add_argument("--exam-type", default="", help="Yalnızca bu sınav türü")
    parser.add_argument("--all", action="store_true", help="Tüm havuzu sil")
    parser.add_argument("--apply", action="store_true", help="Gerçekten sil")
    args = parser.parse_args()

    if not args.course and not args.all:
        print("Ya --course ver ya da --all kullan.")
        return 1

    where, params = "1=1", []
    if args.course:
        where += " AND course = ?"
        params.append(args.course)
    if args.exam_type:
        where += " AND exam_type = ?"
        params.append(args.exam_type)

    with _connect() as connection:
        rows = connection.execute(
            f"SELECT id, course, exam_type, topic, has_figure FROM questions WHERE {where}",
            params,
        ).fetchall()

        print(f"{len(rows)} soru eşleşti.")
        for row in rows[:15]:
            mark = " [şekilli]" if row["has_figure"] else ""
            print(f"  {row['course']} · {row['exam_type']} · {row['topic']}{mark}")
        if len(rows) > 15:
            print(f"  … ve {len(rows) - 15} tane daha")

        if not args.apply:
            print("\n(Önizleme. Silmek için --apply ekle.)")
            return 0

        # Şekil dosyalarını da temizliyoruz; yoksa diskte sahipsiz PNG kalıyor.
        removed_figures = sum(
            1 for row in rows if row["has_figure"] and storage.delete_figure(row["id"])
        )

        connection.execute(f"DELETE FROM questions WHERE {where}", params)

    print(f"\n{len(rows)} soru silindi, {removed_figures} şekil dosyası kaldırıldı.")
    return 0


if __name__ == "__main__":
    sys.exit(main())