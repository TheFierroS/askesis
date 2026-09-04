"""
Uçtan uca deneme scripti.

Kullanım (proje kökünden):
    python -m scripts.try_pipeline "yol/lineer_cebir_vize_test.pdf" \
        --department "Computer Engineering" \
        --course "Linear Algebra" \
        --exam-type "Midterm" \
        --count 3

Ne yapıyor:
  1. Dosyadan metin çıkarır (dijital → OCR → vision, otomatik)
  2. Metni sorulara böler ve Chroma'ya yazar
  3. Referansları çekip yeni sorular üretir
  4. Hakemden geçirir
  5. Her adımı ekrana döker

Bu script API'ye bağlı değil; amacı zincirin çalıştığını gözle görmek.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from app.services import generator, retrieval
from app.services.extraction import extract

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)-7s %(name)s: %(message)s",
)

LINE = "─" * 70


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", help="Sınav dosyası (pdf/png/jpg/txt)")
    parser.add_argument("--department", default="Computer Engineering")
    parser.add_argument("--course", default="Linear Algebra")
    parser.add_argument("--exam-type", default="Midterm")
    parser.add_argument("--count", type=int, default=3)
    parser.add_argument(
        "--skip-ingest",
        action="store_true",
        help="Dosyayı tekrar yükleme, doğrudan üretime geç",
    )
    args = parser.parse_args()

    if not args.skip_ingest:
        path = Path(args.path)
        if not path.exists():
            print(f"Dosya bulunamadı: {path}")
            return 1

        print(f"{LINE}\n1. METİN ÇIKARMA\n{LINE}")
        result = extract(path.name, path.read_bytes())
        print(f"yöntem      : {result.method}")
        print(f"karakter    : {len(result.text)}")
        print(f"inceleme?   : {result.needs_review}")
        for note in result.notes:
            print(f"not         : {note}")

        if not result.is_usable:
            print("\nMetin çıkarılamadı, devam edilemiyor.")
            return 1

        print(f"\nilk 400 karakter:\n{result.text[:400]}")

        print(f"\n{LINE}\n2. SORULARA BÖLME + KAYIT\n{LINE}")
        ingested = retrieval.ingest_exam(
            result.text,
            department=args.department,
            course=args.course,
            exam_type=args.exam_type,
            source_name=path.name,
        )
        print(f"ayrıştırılan soru : {ingested.parsed}")
        print(f"eklenen soru      : {ingested.added}")
        print(f"zaten kayıtlı     : {ingested.skipped}")

        if ingested.nothing_parsed:
            print("\nMetin sorulara bölünemedi, devam edilemiyor.")
            return 1
        if ingested.all_duplicates:
            print("\nBu dosya zaten yüklenmiş. Üretime devam ediliyor.")

    total = retrieval.count_references(args.department, args.course, args.exam_type)
    print(f"\nveritabanındaki toplam referans: {total}")
    if total == 0:
        print("Bu ders için referans yok.")
        return 1

    # Referansları burada seçip üretime aynen geçiriyoruz. Önceki sürümde
    # ekrana ayrı bir örnekleme basılıyordu, yani gösterilen referanslar
    # üretimde kullanılanlar değildi.
    references = generator.pick_references(
        args.department, args.course, args.exam_type, args.count
    )
    print(f"\n{LINE}\n3. KULLANILAN REFERANSLAR ({len(references)} adet)\n{LINE}")
    for ref in references:
        print(f"  • {ref[:110]}")

    print(f"\n{LINE}\n4. ÜRETİM + HAKEM\n{LINE}")
    try:
        approved, rejections = generator.generate_reviewed(
            department=args.department,
            course=args.course,
            exam_type=args.exam_type,
            count=args.count,
            references=references,
        )
    except generator.NoReferencesError as exc:
        print(f"Referans yok: {exc}")
        return 1

    print(f"\nONAYLANAN ({len(approved)}):")
    for i, question in enumerate(approved, 1):
        print(f"\n  {i}. [{question.topic} / {question.difficulty}]")
        print(f"     {question.prompt}")

    if rejections:
        print(f"\nREDDEDİLEN ({len(rejections)}):")
        for reason in rejections:
            print(f"  • {reason}")

    return 0


if __name__ == "__main__":
    sys.exit(main())