"""
Mevcut referanslara geriye dönük konu etiketi ekler.

Konu etiketleme sonradan geldiği için daha önce yüklenmiş sorularda `topic`
alanı boş. Bu script onları bulup etiketliyor.

Kullanım (proje kökünden):
    python -m scripts.backfill_topics            # ne yapacağını gösterir
    python -m scripts.backfill_topics --apply    # gerçekten yazar

Ders başına tek LLM çağrısı yapıyor.
"""

from __future__ import annotations

import argparse
import logging
import sys

from app.services import retrieval
from app.services.labeling import label_questions

logging.basicConfig(level=logging.INFO, format="%(levelname)-7s %(name)s: %(message)s")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Yazmadan önce ne yapılacağını görmek için bu bayrağı verme",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Etiketi olanları da yeniden etiketle",
    )
    args = parser.parse_args()

    collection = retrieval.get_collection()
    combos = retrieval.available_combinations()

    if not combos:
        print("Veritabanında hiç referans yok.")
        return 1

    for combo in combos:
        result = collection.get(
            where=retrieval._filter(
                combo["department"], combo["course"], combo["exam_type"]
            ),
            include=["documents", "metadatas"],
        )

        pending = [
            i
            for i, metadata in enumerate(result["metadatas"])
            if args.force or not (metadata.get("topic") or "").strip()
        ]

        header = f"{combo['department']} / {combo['course']} / {combo['exam_type']}"
        print(f"\n{header}")
        print(f"  toplam {len(result['ids'])} soru, {len(pending)} tanesi etiketsiz")

        if not pending:
            continue

        known = list(
            retrieval.topic_distribution(
                combo["department"], combo["course"], combo["exam_type"]
            )
        )
        topics = label_questions(
            [result["documents"][i] for i in pending], known_topics=known
        )

        for i, topic in zip(pending, topics, strict=True):
            preview = result["documents"][i][:60].replace("\n", " ")
            print(f"    {topic or '(etiketlenemedi)':<32} ← {preview}")

        if not args.apply:
            continue

        # Chroma'da metadata güncellemek için update kullanıyoruz; documents
        # değişmediği için embedding yeniden hesaplanmıyor.
        updated_metadatas = []
        for i, topic in zip(pending, topics, strict=True):
            metadata = dict(result["metadatas"][i])
            metadata["topic"] = topic
            updated_metadatas.append(metadata)

        collection.update(
            ids=[result["ids"][i] for i in pending],
            metadatas=updated_metadatas,
        )
        print(f"  ✓ {len(pending)} kayıt güncellendi")

    if not args.apply:
        print("\n(Önizleme. Yazmak için --apply ekle.)")
    else:
        print("\nKonu dağılımları:")
        for combo in combos:
            distribution = retrieval.topic_distribution(
                combo["department"], combo["course"], combo["exam_type"]
            )
            print(f"  {combo['course']} / {combo['exam_type']}: {distribution}")

    return 0


if __name__ == "__main__":
    sys.exit(main())