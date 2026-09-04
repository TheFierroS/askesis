"""
Referans soru deposu (Chroma).

Eski db_service'ten farkı:
- Sınav tek doküman olarak değil, soru soru saklanıyor.
- `collection.get(where=...)` yerine `collection.query(...)` kullanılıyor.
  `get` filtreye uyan ilk kaydı döndürüyordu — hep aynı sınav, hiç benzerlik
  hesabı yok. Yani ortada RAG yoktu, sadece "ilk kaydı çek" vardı.

Embedding modeli hakkında:
Chroma varsayılan olarak all-MiniLM-L6-v2'yi ONNX Runtime üzerinden çalıştırıyor.
İlk kullanımda ~90 MB indiriyor, sonra tamamen yerel ve ücretsiz. PyTorch
gerektirmediği için ucuz bir VPS'te de sorunsuz.

Model ağırlıklı olarak İngilizce eğitildi, Türkçe semantik yakalayışı orta.
Bizim için sorun değil çünkü önce metadata ile filtreliyoruz: arama zaten tek
bir dersin ~50 sorusu içinde yapılıyor, embedding'in tek işi bu küçük kümeyi
sıralamak. Çok dilli bir model (paraphrase-multilingual-MiniLM) daha iyi
sıralardı ama sentence-transformers + torch ~2 GB bağımlılık demek; bu
noktada kazanç maliyeti karşılamıyor.
"""

from __future__ import annotations

import logging
import random
import uuid
from datetime import datetime, timezone
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import chromadb

from app.config import get_settings
from app.services.chunking import QuestionChunk, split_questions
from app.services.similarity import INGEST_THRESHOLD, too_similar

logger = logging.getLogger(__name__)

COLLECTION_NAME = "reference_questions"


@dataclass
class DocumentInfo:
    """Yüklenmiş bir sınav dosyası ve ondan çıkan soru sayısı."""

    document_id: str
    department: str
    course: str
    exam_type: str
    source_name: str
    uploaded_at: str
    question_count: int


@dataclass
class IngestResult:
    """
    Yükleme sonucu.

    Üç durumu ayırt etmek için: metin hiç bölünemedi / bölündü ama hepsi zaten
    kayıtlıydı / yeni sorular eklendi. Tek bir sayı döndürseydik "0" üç anlama
    birden gelirdi ve admin'e ne söyleyeceğimizi bilemezdik.
    """

    document_id: str
    added: int
    skipped: int
    parsed: int

    @property
    def nothing_parsed(self) -> bool:
        return self.parsed == 0

    @property
    def all_duplicates(self) -> bool:
        return self.parsed > 0 and self.added == 0


@dataclass
class ReferenceQuestion:
    id: str
    text: str
    metadata: dict[str, Any]


@lru_cache
def get_collection():
    """
    Koleksiyonu tek sefer açar.

    hnsw:space="cosine": varsayılan L2 yerine kosinüs benzerliği. Metin
    embedding'lerinde standart olan bu; L2 uzun metinleri haksız yere
    uzaklaştırıyor.
    """
    settings = get_settings()
    client = chromadb.PersistentClient(path=settings.chroma_path)
    return client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


def _filter(department: str, course: str, exam_type: str | None = None) -> dict:
    """
    Referans araması: DERS ve SINAV TÜRÜ üzerinden, bölümden bağımsız.

    Neden bölüm yok?
    Lineer Cebir bilgisayar, makine ve elektrikte aynı ders, çoğu zaman aynı
    hocanın aynı sınavı. Bölümü de anahtara koyunca aynı sınavı üç kez
    yüklemek ve üç ayrı havuz beslemek gerekiyordu — hepsi zayıf kalıyordu.

    Ders adı ortak anahtar: bir bölümden yüklenen sınav, o dersi alan bütün
    bölümlere hizmet ediyor.

    İki bölümde aynı adı taşıyıp GERÇEKTEN farklı işlenen bir ders varsa,
    çözüm ders adını ayırmak: "Physics I (EE)" gibi. Kod tarafında bir şey
    yapmaya gerek yok.

    `department` parametresi imzada duruyor: çağrı yerlerini değiştirmemek ve
    ileride ayrıştırmak gerekirse geri açabilmek için.
    """
    conditions: list[dict] = [{"course": course}]
    if exam_type:
        conditions.append({"exam_type": exam_type})

    # Chroma tek koşulda $and kabul etmiyor.
    if len(conditions) == 1:
        return conditions[0]
    return {"$and": conditions}


# ----------------------------------------------------------------- yazma


def ingest_exam(
    raw_text: str,
    *,
    department: str,
    course: str,
    exam_type: str,
    source_name: str = "",
    label_topics: bool = True,
) -> IngestResult:
    """
    Sınav metnini sorulara bölüp koleksiyona yazar.

    Dönen IngestResult, üç durumu ayırt ediyor: metin bölünemedi, bölündü ama
    hepsi zaten kayıtlıydı, ya da yeni sorular eklendi.
    """
    chunks: list[QuestionChunk] = split_questions(raw_text)
    if not chunks:
        logger.warning("Metin sorulara ayrılamadı: %s", source_name or "(isimsiz)")
        return IngestResult(document_id="", added=0, skipped=0, parsed=0)

    collection = get_collection()

    # Aynı sınavın ikinci kez yüklenmesine karşı benzerlik kontrolü.
    #
    # Parmak izi (fingerprint) tam metin eşleşmesine bakıyor ve bu yetmiyor:
    # vision aynı sayfayı iki kez okuduğunda birebir aynı metni vermiyor
    # (bir noktalama farkı bile parmak izini değiştiriyor). Sonuçta aynı soru
    # veritabanına iki farklı kayıt olarak giriyor ve konu dağılımını bozuyor.
    existing_docs = collection.get(
        where=_filter(department, course, exam_type),
        include=["documents"],
    )["documents"]

    fresh: list[QuestionChunk] = []
    skipped = 0
    for chunk in chunks:
        if any(
            too_similar(chunk.text, old, INGEST_THRESHOLD, check_numbers=True)
            for old in existing_docs
        ):
            skipped += 1
            continue
        existing_docs.append(chunk.text)
        fresh.append(chunk)

    if skipped:
        logger.info("%d soru zaten veritabanında, atlandı", skipped)

    if not fresh:
        logger.info("Bu dosyadaki soruların hepsi zaten kayıtlı: %s", source_name)
        return IngestResult(
            document_id="", added=0, skipped=skipped, parsed=len(chunks)
        )

    parsed_count = len(chunks)
    chunks = fresh
    doc_id = str(uuid.uuid4())

    # Konu etiketleri: sınav başına tek LLM çağrısı, bir kez.
    # İçeride import ediyoruz ki etiketleme kapalıyken LLM katmanı yüklenmesin.
    topics: list[str] = [""] * len(chunks)
    if label_topics:
        from app.services.labeling import label_questions  # noqa: PLC0415

        # Bu ders için daha önce kullanılmış etiketleri modele gösteriyoruz ki
        # aynı kavrama her sınavda yeni bir ad uydurmasın.
        known = list(topic_distribution(department, course, exam_type))
        topics = label_questions([c.text for c in chunks], known_topics=known)

    ids: list[str] = []
    documents: list[str] = []
    metadatas: list[dict[str, Any]] = []

    for chunk, topic in zip(chunks, topics, strict=True):
        # id olarak parmak izi kullanıyoruz: aynı soru ikinci kez yüklenirse
        # upsert onu günceller, kopya oluşmaz. Aynı sınavı iki kez yüklemek
        # veritabanını şişirmiyor.
        ids.append(f"{department}|{course}|{exam_type}|{chunk.fingerprint}")
        documents.append(chunk.text)
        metadatas.append(
            {
                "department": department,
                "course": course,
                "exam_type": exam_type,
                "source_doc": doc_id,
                "source_name": source_name,
                "position": chunk.index,
                "char_len": len(chunk.text),
                "topic": topic,
                # Admin panelinde "ne zaman yüklendi" göstermek ve listeyi
                # sıralamak için. Chroma metadata'da tarih tutmuyor.
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    collection.upsert(ids=ids, documents=documents, metadatas=metadatas)
    logger.info("%s/%s/%s: %d soru eklendi", department, course, exam_type, len(ids))
    return IngestResult(
        document_id=doc_id, added=len(ids), skipped=skipped, parsed=parsed_count
    )


# ----------------------------------------------------------------- okuma


def count_references(department: str, course: str, exam_type: str) -> int:
    result = get_collection().get(
        where=_filter(department, course, exam_type),
        include=[],
    )
    return len(result["ids"])


def topic_distribution(
    department: str, course: str, exam_type: str
) -> dict[str, int]:
    """
    Bu ders için konu → soru sayısı dağılımı.

    Ürün açısından da değerli: "bu derste en çok çıkan konular" listesini
    doğrudan buradan besleyebiliriz.
    """
    result = get_collection().get(
        where=_filter(department, course, exam_type),
        include=["metadatas"],
    )

    counts: dict[str, int] = {}
    for metadata in result["metadatas"]:
        topic = (metadata.get("topic") or "").strip()
        if topic and topic != "unreadable":
            counts[topic] = counts.get(topic, 0) + 1

    return dict(sorted(counts.items(), key=lambda kv: -kv[1]))


def _weighted_topics(counts: dict[str, int], k: int) -> list[str]:
    """
    Konuları sıklıklarına göre, tekrarsız seçer.

    Sık çıkan konunun seçilme olasılığı yüksek ama garanti değil — böylece
    her üretim turu biraz farklı bir konu karışımı veriyor, havuz tek düze
    olmuyor. k konu sayısını aşarsa liste baştan tekrar ediliyor (aynı
    konudan farklı sorular seçilecek).
    """
    chosen: list[str] = []
    remaining = dict(counts)

    while len(chosen) < k and remaining:
        topics = list(remaining)
        weights = [remaining[t] for t in topics]
        picked = random.choices(topics, weights=weights, k=1)[0]
        chosen.append(picked)
        del remaining[picked]

    # İstenen sayı konu sayısından fazlaysa baştan dolaş.
    while len(chosen) < k and chosen:
        chosen.append(chosen[len(chosen) % len(counts)])

    return chosen


def sample_references(
    department: str,
    course: str,
    exam_type: str,
    k: int = 3,
) -> list[ReferenceQuestion]:
    """
    Havuzu doldururken kullanılan yol: konu dağılımına göre ağırlıklı seçim.

    Neden düz rastgele değil?
    Düz rastgelede her sorunun şansı eşit oluyor ve sınavın konu ağırlığı
    kayboluyor. Determinant 4 sınavda da çıkmışsa üretilen sorularda da o
    oranda temsil edilmeli.

    Neden her seferinde en sık konuyu seçmiyoruz?
    Ağırlıklı seçim olasılık veriyor, garanti değil. Böylece her tur farklı
    bir karışım çıkıyor ve havuz tek düze olmuyor.

    Etiket yoksa (eski kayıtlar, etiketleme başarısız) eski davranışa,
    düz rastgele seçime düşüyoruz.
    """
    result = get_collection().get(
        where=_filter(department, course, exam_type),
        include=["documents", "metadatas"],
    )

    ids = result["ids"]
    if not ids:
        return []

    def build(i: int) -> ReferenceQuestion:
        return ReferenceQuestion(
            id=ids[i],
            text=result["documents"][i],
            metadata=result["metadatas"][i],
        )

    # Konuya göre indeks grupları
    by_topic: dict[str, list[int]] = {}
    for i, metadata in enumerate(result["metadatas"]):
        topic = (metadata.get("topic") or "").strip()
        if topic and topic != "unreadable":
            by_topic.setdefault(topic, []).append(i)

    if not by_topic:
        picked = random.sample(range(len(ids)), min(k, len(ids)))
        return [build(i) for i in picked]

    counts = {topic: len(indices) for topic, indices in by_topic.items()}
    used: set[int] = set()
    out: list[ReferenceQuestion] = []

    for topic in _weighted_topics(counts, k):
        candidates = [i for i in by_topic[topic] if i not in used]
        if not candidates:
            continue
        index = random.choice(candidates)
        used.add(index)
        out.append(build(index))

    # Konu sayısı yetmediyse kalanları rastgele tamamla.
    if len(out) < k:
        leftovers = [i for i in range(len(ids)) if i not in used]
        random.shuffle(leftovers)
        out.extend(build(i) for i in leftovers[: k - len(out)])

    return out


def search_similar(
    query: str,
    *,
    department: str,
    course: str,
    exam_type: str | None = None,
    k: int = 3,
) -> list[ReferenceQuestion]:
    """
    Konu hedefli arama: "türev" dediğinde türev soruları gelsin.

    Havuz doldurmada değil, ileride "bu konudan soru istiyorum" özelliğinde
    kullanılacak.
    """
    result = get_collection().query(
        query_texts=[query],
        n_results=k,
        where=_filter(department, course, exam_type),
        include=["documents", "metadatas", "distances"],
    )

    if not result["ids"] or not result["ids"][0]:
        return []

    out: list[ReferenceQuestion] = []
    for i, doc_id in enumerate(result["ids"][0]):
        metadata = dict(result["metadatas"][0][i])
        # Mesafe 0'a yakınsa çok benzer. Çağıran taraf eşik uygulamak isteyebilir.
        metadata["distance"] = result["distances"][0][i]
        out.append(
            ReferenceQuestion(
                id=doc_id,
                text=result["documents"][0][i],
                metadata=metadata,
            )
        )
    return out


# ----------------------------------------------------------------- yönetim


def list_documents() -> list[DocumentInfo]:
    """
    Yüklenmiş sınav dosyalarını listeler.

    Chroma'da doküman diye bir kavram yok, her soru ayrı bir kayıt. Aynı
    source_doc değerini taşıyan soruları gruplayarak dosya listesini
    yeniden kuruyoruz.
    """
    result = get_collection().get(include=["metadatas"])

    grouped: dict[str, DocumentInfo] = {}
    for metadata in result["metadatas"]:
        doc_id = metadata.get("source_doc", "")
        if not doc_id:
            continue

        if doc_id in grouped:
            grouped[doc_id].question_count += 1
            continue

        grouped[doc_id] = DocumentInfo(
            document_id=doc_id,
            department=metadata.get("department", ""),
            course=metadata.get("course", ""),
            exam_type=metadata.get("exam_type", ""),
            source_name=metadata.get("source_name", ""),
            uploaded_at=metadata.get("uploaded_at", ""),
            question_count=1,
        )

    return sorted(grouped.values(), key=lambda d: d.uploaded_at, reverse=True)


def delete_document(document_id: str) -> int:
    """
    Bir dosyadan gelen tüm referans soruları siler.

    Dönen: silinen soru sayısı. 0 ise böyle bir doküman yok.

    Havuzdaki ÜRETİLMİŞ sorulara dokunmuyoruz. Onlar zaten üretilmiş ve
    kullanıcılara dağıtılmış olabilir; referansı silmek geçmişi silmek
    anlamına gelmemeli. Sadece bundan sonraki üretimlerde bu referanslar
    kullanılmıyor.
    """
    collection = get_collection()
    result = collection.get(where={"source_doc": document_id}, include=[])

    ids = result["ids"]
    if not ids:
        return 0

    collection.delete(ids=ids)
    logger.info("%d referans soru silindi (doküman %s)", len(ids), document_id)
    return len(ids)


def available_combinations() -> list[dict[str, str]]:
    """
    Hangi (bölüm, ders, sınav türü) üçlüleri için referans var?
    Havuz worker'ı bunu dolaşarak hangi kombinasyonu doldurması gerektiğine
    karar verecek. Ayrıca frontend'deki seçim listelerini de buradan
    besleyebiliriz — elde referansı olmayan dersi kullanıcıya göstermenin
    anlamı yok.
    """
    result = get_collection().get(include=["metadatas"])
    seen: set[tuple[str, str, str]] = set()

    for metadata in result["metadatas"]:
        seen.add(
            (
                metadata.get("department", ""),
                metadata.get("course", ""),
                metadata.get("exam_type", ""),
            )
        )

    return [
        {"department": d, "course": c, "exam_type": e}
        for d, c, e in sorted(seen)
        if d and c and e
    ]