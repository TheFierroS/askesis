"""
Eskiden yüklenmiş sınavlara dosyalarını bağlar.

Dosya saklama ve yükleme tarihi sonradan eklendi; script'le yüklenmiş
sınavların diskte dosyası yok, admin panelinde "Preview" butonu çıkmıyor ve
tarihleri boş görünüyor.

Panelden tekrar yüklemek işe yaramıyor: referanslar zaten kayıtlı olduğu için
sunucu 409 döndürüyor ve dosya kaydedilmeden istek bitiyor. Bu script eşlemeyi
doğrudan yapıyor.

Eşleştirme dosya ADIYLA: Chroma'daki source_name ile klasördeki dosya adı
birebir tutmalı.

Kullanım (proje kökünden):
    python -m scripts.backfill_files                  # önizleme
    python -m scripts.backfill_files --apply          # uygula
    python -m scripts.backfill_files --dir yol --apply
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

from app.services import retrieval, storage


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dir",
        default=".",
        help="Dosyaların aranacağı klasör (varsayılan: proje kökü)",
    )
    parser.add_argument("--apply", action="store_true", help="Gerçekten uygula")
    args = parser.parse_args()

    search_dir = Path(args.dir)
    if not search_dir.is_dir():
        print(f"Klasör bulunamadı: {search_dir}")
        return 1

    documents = retrieval.list_documents()
    if not documents:
        print("Kayıtlı sınav yok.")
        return 1

    collection = retrieval.get_collection()
    matched = 0

    for doc in documents:
        has_file = storage.find(doc.document_id) is not None
        status = "dosyası var" if has_file else "dosyası yok"
        print(f"\n{doc.source_name or '(isimsiz)'} — {doc.course} / {doc.exam_type}")
        print(f"  {doc.question_count} soru, {status}")

        if has_file:
            continue

        if not doc.source_name:
            print("  ! kaynak dosya adı kayıtlı değil, eşleştirilemiyor")
            continue

        candidate = search_dir / doc.source_name
        if not candidate.exists():
            print(f"  ! {candidate} bulunamadı")
            continue

        print(f"  → {candidate.name} bağlanacak")
        matched += 1

        if not args.apply:
            continue

        storage.save(doc.document_id, candidate.name, candidate.read_bytes())

        # Yükleme tarihi de eksikse dosyanın değiştirilme tarihini kullanıyoruz.
        # Gerçek yükleme anını bilmiyoruz ama boş bırakmaktan iyi.
        if not doc.uploaded_at:
            stamp = datetime.fromtimestamp(
                candidate.stat().st_mtime, tz=timezone.utc
            ).isoformat()

            result = collection.get(
                where={"source_doc": doc.document_id}, include=["metadatas"]
            )
            updated = []
            for metadata in result["metadatas"]:
                new_metadata = dict(metadata)
                new_metadata["uploaded_at"] = stamp
                updated.append(new_metadata)

            # documents değişmediği için embedding yeniden hesaplanmıyor.
            collection.update(ids=result["ids"], metadatas=updated)
            print(f"  ✓ tarih yazıldı: {stamp[:10]}")

        print("  ✓ dosya bağlandı")

    if not args.apply and matched:
        print(f"\n(Önizleme. {matched} dosya bağlanacak. Uygulamak için --apply ekle.)")
    elif not matched:
        print("\nBağlanacak dosya yok.")

    return 0


if __name__ == "__main__":
    sys.exit(main())