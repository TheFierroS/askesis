"""
Havuzdaki konu etiketlerini tek biçime indirger.

Neden gerekli:
Üretim yolu uzun süre normalleştirmeden geçmiyordu; modelin yazdığı etiket
olduğu gibi kaydediliyordu. Sonuç, aynı kavramın veritabanında birden fazla
satır olarak durmasıydı — "Matrix Inverse", "Matrix inverse",
"Matrix Inversion". Konu dağılımı bu haliyle sayılamıyor.

Üretim tarafı düzeltildi; bu betik geçmişteki kayıtları toparlıyor.
Bir kez çalıştırmak yeterli, ama tekrar çalıştırmak zararsız: zaten
normalleştirilmiş bir etiketi yeniden normalleştirmek aynı sonucu veriyor.

Kullanım:
    .venv/bin/python -m scripts.normalize_topics          # ne değişecek, göster
    .venv/bin/python -m scripts.normalize_topics --apply  # uygula
"""

from __future__ import annotations

import argparse
from collections import Counter

from app.services.labeling import normalize_topic
from app.services.pool import _connect


def main() -> None:
    parser = argparse.ArgumentParser(description="Konu etiketlerini normalleştirir")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Değişiklikleri yaz. Verilmezse yalnızca önizleme gösterilir.",
    )
    args = parser.parse_args()

    with _connect() as conn:
        rows = list(conn.execute("SELECT id, topic FROM questions"))

        changes: list[tuple[str, str, str]] = []
        for row in rows:
            old = row["topic"] or ""
            new = normalize_topic(old)
            if new != old:
                changes.append((row["id"], old, new))

        print(f"Toplam {len(rows)} soru, {len(changes)} tanesinin etiketi değişecek.\n")

        # Aynı dönüşümü tekrar tekrar yazdırmak yerine grupluyoruz:
        # "Matrix Inverse -> matrix inverse (3 soru)" okumak daha kolay.
        summary = Counter((old, new) for _, old, new in changes)
        for (old, new), count in summary.most_common():
            print(f"  {old!r} -> {new!r}  ({count} soru)")

        if not args.apply:
            print("\nÖnizleme. Uygulamak için --apply ekle.")
            return

        conn.executemany(
            "UPDATE questions SET topic = ? WHERE id = ?",
            [(new, qid) for qid, _, new in changes],
        )
        conn.commit()
        print(f"\n{len(changes)} etiket güncellendi.")

        after = conn.execute(
            "SELECT COUNT(DISTINCT topic) AS n FROM questions"
        ).fetchone()
        print(f"Farklı konu sayısı: {after['n']}")


if __name__ == "__main__":
    main()