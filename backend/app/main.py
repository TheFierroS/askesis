"""
FastAPI uygulaması.

Streamlit'in yerini alıyor: Next.js frontend buraya HTTP ile bağlanacak.

Uç noktaların tasarım ilkesi: kullanıcıya dönen yolda LLM olmasın.
`/api/exam` normalde sadece SQLite'tan okuyor. LLM yalnızca havuz boşsa
(yeni eklenmiş bir ders) devreye giriyor ve yanıtta `source: "generated"`
diye işaretleniyor — frontend loader'ı buna göre gösterebilir.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response

from app.auth import auth_status, current_user, require_admin
from app.logging_setup import setup_logging
from app.config import get_settings
from app.schemas import (
    CreditAccountOut,
    CreditBalanceOut,
    DocumentOut,
    ExamDetailOut,
    ExamPdfRequest,
    ExamRequest,
    ExamSummaryOut,
    GrantCreditsRequest,
    ExamResponse,
    IngestResponse,
    PoolStatOut,
    QuestionOut,
    SolutionResponse,
)
from app.services import (
    clerk_users,
    credits,
    figures,
    generator,
    latex,
    pool,
    retrieval,
    solver,
    storage,
)
from app.services.extraction import extract
from app.services.llm import AllProvidersFailed, provider_status
from app.workers.refill import reset_backoff, start_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)-7s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

_scheduler = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Log yapılandırması ilk iş: bundan sonraki her satır dosyaya da yazılıyor.
    settings_now = get_settings()
    setup_logging(
        settings_now.log_dir,
        getattr(logging, settings_now.log_level.upper(), logging.INFO),
    )

    """
    Açılış/kapanış işleri.

    Tabloları burada oluşturuyoruz ki uygulama ilk kez çalıştığında elle bir
    migration komutu gerekmesin. Zamanlayıcıyı da burada başlatıp kapanışta
    düzgünce durduruyoruz — yoksa süreç sonlanmıyor.
    """
    global _scheduler
    pool.init_db()

    if get_settings().auth_dev_mode:
        logger.warning(
            "AUTH_DEV_MODE açık: JWT doğrulaması yapılmıyor, X-User-Id "
            "başlığına güveniliyor. Üretimde kapatılmalı."
        )

    _scheduler = start_scheduler()
    yield
    if _scheduler:
        _scheduler.shutdown(wait=False)


app = FastAPI(title="Sinav AI", version="0.1.0", lifespan=lifespan)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------- sağlık


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "auth": auth_status(),
        "latex": "hazır" if latex.latex_available() else "kurulu değil",
        "providers": provider_status(),
        "pools": pool.stats(),
    }


@app.get("/api/catalog")
def catalog() -> list[dict]:
    """
    Frontend'in seçim listelerini besler.

    İki kaynağı birleştiriyor:
      - referansı olan dersler (retrieval): yeni soru üretilebilir
      - havuzda sorusu olan dersler (pool): hazır soru verilebilir

    İkincisi neden ayrı gerekiyor? Referans silindiğinde ya da sorular elle
    eklendiğinde havuzda soru olmasına rağmen ders listede görünmüyordu;
    kullanıcı alabileceği bir dersi "henüz hazır değil" diye görüyordu.

    Ders adı anahtar, bölüm değil: aynı ders birden fazla programda
    okutuluyorsa referanslar ve havuz paylaşılıyor.
    """
    combos: dict[tuple[str, str], dict] = {}

    for entry in retrieval.available_combinations():
        combos[(entry["course"], entry["exam_type"])] = entry

    for row in pool.stats():
        key = (row["course"], row["exam_type"])
        combos.setdefault(
            key,
            {
                "department": row["department"],
                "course": row["course"],
                "exam_type": row["exam_type"],
            },
        )

    return list(combos.values())


# ----------------------------------------------------------------------- sınav


# Anlık üretimde kaç tur denenecek.
# Her turda hakem reddi ve kopya elemesi yüzünden istenenden az soru
# geçebiliyor; tek tur deneyip pes etmek kullanıcıyı eksik bırakıyordu.
# Üst sınır şart: referans havuzu tükendiğinde sonsuza kadar denemesin.
MAX_GENERATION_ROUNDS = 3

# Her turda istenenden bu kadar fazla üretiyoruz.
# Hakem tipik olarak %30-50 reddediyor, kopya filtresi de bir kısmını eliyor.
# Fazladan istemek ek tur açmaktan ucuz: aynı istekte 2 soru fazla üretmek,
# ikinci bir üretim+hakem çifti çalıştırmaktan az token harcıyor.
GENERATION_OVERSHOOT = 2


@app.post("/api/exam", response_model=ExamResponse)
def create_exam(
    request: ExamRequest,
    user_id: str = Depends(current_user),
) -> ExamResponse:
    """
    Kullanıcıya soru seti verir.

    Önce havuzdan çeker. Eksik kalırsa anlık üretime geçer ve istenen sayıya
    ulaşana kadar birkaç tur dener. Referanslar tükenmişse elde ne varsa onu
    döndürür — kullanıcı ne aldığını görüyor, sessizce eksik kalmıyor.
    """
    # Hak kontrolü üretimden ÖNCE: hakkı olmayan biri için LLM çalıştırmanın
    # anlamı yok. Düşme işlemi ise sonda, gerçekten verilen soru sayısı
    # kadar — az soru gelirse az düşsün.
    available = credits.balance(user_id)
    if available <= 0:
        raise HTTPException(
            status_code=402,
            detail="Soru hakkın kalmadı.",
        )

    questions = pool.take_questions(
        user_id=user_id,
        department=request.department,
        course=request.course,
        exam_type=request.exam_type,
        # Hakkından fazlasını üretmeye kalkmıyoruz.
        count=min(request.num_questions, available),
    )

    source = "pool"
    rounds = 0

    target = min(request.num_questions, available)

    while len(questions) < target and rounds < MAX_GENERATION_ROUNDS:
        rounds += 1
        missing = target - len(questions)
        logger.info(
            "Havuz yetersiz (tur %d/%d), %d soru eksik",
            rounds,
            MAX_GENERATION_ROUNDS,
            missing,
        )

        try:
            approved, _ = generator.generate_reviewed(
                department=request.department,
                course=request.course,
                exam_type=request.exam_type,
                count=min(missing + GENERATION_OVERSHOOT, 10),
            )
        except generator.NoReferencesError:
            raise HTTPException(
                status_code=404,
                detail="Bu ders için henüz referans sınav yüklenmemiş.",
            ) from None
        except AllProvidersFailed:
            # Havuzdan bir şeyler geldiyse onlarla devam; hiç yoksa hata.
            if not questions:
                raise HTTPException(
                    status_code=503,
                    detail="Soru üretimi şu an yapılamıyor, birazdan tekrar deneyin.",
                ) from None
            break

        if not approved:
            # Hakem hepsini reddetti. Her tur FARKLI rastgele referanslarla
            # çalıştığı için yeniden denemek anlamlı — bir sonraki tura geç.
            logger.info("Hakem bu turda hiçbir soruyu onaylamadı, tekrar deneniyor")
            continue

        new_ids = pool.add_questions(
            approved,
            department=request.department,
            course=request.course,
            exam_type=request.exam_type,
        )

        if not new_ids:
            # Sorular onaylandı ama hepsinin havuzda benzeri varmış. Bu,
            # referanslardan üretilebilecek farklı soruların tükendiği anlamına
            # geliyor; tekrar denemek aynı kopyaları üretip token yakar.
            logger.info(
                "Üretilenlerin hepsi havuzdaki sorularla aynı — referanslar tükendi"
            )
            break

        # Şekilleri üret: soru metni hazır, görseli de yanında gitsin.
        figures.attach(new_ids, approved)

        # Sadece az önce eklenenleri veriyoruz: havuzdan rastgele çekersek
        # kullanıcının beklediği yeni sorular yerine eskiler gelebilir.
        questions += pool.take_by_ids(user_id, new_ids[:missing])
        source = "generated"

    if not questions:
        raise HTTPException(
            status_code=404,
            detail="Bu ders için gösterilecek soru bulunamadı.",
        )

    if len(questions) < request.num_questions:
        logger.info(
            "%d soru istendi, %d verilebildi (referans ya da hak sınırı)",
            request.num_questions,
            len(questions),
        )

    # Hak düşme: verilen soru kadar. Üretim başarısız olup az soru geldiyse
    # kullanıcı almadığı sorunun bedelini ödemiyor.
    credits_left = credits.consume(
        user_id, len(questions), reason=f"{request.course} · {request.exam_type}"
    )

    # Geçmişe kaydet: hesap açmanın karşılığı bu — kullanıcı ürettiği sınavlara
    # sonradan dönebiliyor.
    exam_id = pool.save_exam(
        user_id=user_id,
        department=request.department,
        course=request.course,
        exam_type=request.exam_type,
        question_ids=[q.id for q in questions],
    )

    return ExamResponse(
        questions=[
            QuestionOut(
                id=q.id,
                prompt=q.prompt,
                topic=q.topic,
                difficulty=q.difficulty,
                has_figure=q.has_figure,
            )
            for q in questions
        ],
        source=source,
        requested=request.num_questions,
        exam_id=exam_id,
        credits_left=credits_left,
    )


# ------------------------------------------------------------------ sınav geçmişi


def _to_summary(summary: pool.ExamSummary) -> ExamSummaryOut:
    return ExamSummaryOut(
        id=summary.id,
        department=summary.department,
        course=summary.course,
        exam_type=summary.exam_type,
        created_at=summary.created_at,
        question_count=summary.question_count,
    )


@app.get("/api/credits", response_model=CreditBalanceOut)
def my_credits(user_id: str = Depends(current_user)) -> CreditBalanceOut:
    """Kullanıcının kalan soru hakkı."""
    return CreditBalanceOut(balance=credits.balance(user_id))


@app.get("/api/admin/credits", response_model=list[CreditAccountOut])
def admin_credits(_: str = Depends(require_admin)) -> list[CreditAccountOut]:
    """Tüm hesaplar ve bakiyeleri."""
    accounts = credits.list_accounts()

    # İsim ve e-posta Clerk'te duruyor, bizde değil. Tek toplu istekle
    # zenginleştiriyoruz; anahtar yoksa kimlikler olduğu gibi görünüyor.
    people = clerk_users.fetch([account.user_id for account in accounts])

    return [
        CreditAccountOut(
            user_id=account.user_id,
            name=people.get(account.user_id).name if account.user_id in people else "",
            email=people.get(account.user_id).email if account.user_id in people else "",
            balance=account.balance,
            used_total=account.used_total,
            created_at=account.created_at,
            updated_at=account.updated_at,
        )
        for account in accounts
    ]


@app.post("/api/admin/credits", response_model=CreditBalanceOut)
def admin_grant_credits(
    request: GrantCreditsRequest,
    admin_id: str = Depends(require_admin),
) -> CreditBalanceOut:
    """
    Kullanıcıya hak yükler. Negatif değer düzeltme için.

    Her hareket credit_events tablosuna yazılıyor: kimin ne zaman ne kadar
    yüklediği kayıt altında. Ödeme entegrasyonu geldiğinde bu iz zorunlu.
    """
    new_balance = credits.grant(
        request.user_id, request.amount, reason=f"{request.reason} ({admin_id})"
    )
    return CreditBalanceOut(balance=new_balance)


@app.get("/api/exams", response_model=list[ExamSummaryOut])
def list_exams(user_id: str = Depends(current_user)) -> list[ExamSummaryOut]:
    """Kullanıcının geçmiş sınavları, en yeniden eskiye."""
    return [_to_summary(item) for item in pool.list_exams(user_id)]


@app.get("/api/exams/{exam_id}", response_model=ExamDetailOut)
def get_exam(exam_id: str, user_id: str = Depends(current_user)) -> ExamDetailOut:
    """Geçmişten bir sınavı sorularıyla birlikte açar."""
    found = pool.get_exam(user_id, exam_id)
    if not found:
        raise HTTPException(status_code=404, detail="Sınav bulunamadı.")

    summary, questions = found
    return ExamDetailOut(
        exam=_to_summary(summary),
        questions=[
            QuestionOut(
                id=q.id,
                prompt=q.prompt,
                topic=q.topic,
                difficulty=q.difficulty,
                has_figure=q.has_figure,
            )
            for q in questions
        ],
    )


@app.delete("/api/exams/{exam_id}", status_code=204)
def delete_exam(exam_id: str, user_id: str = Depends(current_user)) -> Response:
    """
    Sınavı geçmişten kalıcı olarak siler. Çöp kutusu yok.

    204 No Content: silme başarılı, dönecek gövde yok.
    """
    if not pool.delete_exam(user_id, exam_id):
        raise HTTPException(status_code=404, detail="Sınav bulunamadı.")
    return Response(status_code=204)


@app.post("/api/exam/pdf")
def exam_pdf(
    request: ExamPdfRequest,
    _: str = Depends(current_user),
) -> Response:
    """
    Soruları sınav kağıdı biçiminde PDF olarak döndürür.

    Neden sunucuda LaTeX?
    Tarayıcının yazdırma penceresi bir web sayfasını kağıda döküyor; çıktı ne
    sınav kağıdına benziyor ne de tek tıkla iniyor. LaTeX matematik dizgisi
    için yapılmış, sonuç gerçek bir sınav kağıdı.
    """
    questions = pool.get_questions(request.question_ids)
    if not questions:
        raise HTTPException(status_code=404, detail="Sorular bulunamadı.")

    # Şekilleri de belgeye alıyoruz: şekilli bir soruyu şekilsiz basmak onu
    # cevaplanamaz hale getiriyor.
    figure_names: dict[int, str] = {}
    assets: dict[str, bytes] = {}

    for index, question in enumerate(questions):
        if not question.has_figure:
            continue
        path = storage.find_figure(question.id)
        if not path:
            continue
        name = f"figure_{index}.png"
        figure_names[index] = name
        assets[name] = path.read_bytes()

    try:
        pdf_bytes, skipped = latex.render_exam(
            [q.prompt for q in questions],
            course=request.course,
            exam_type=request.exam_type,
            figures=figure_names,
            assets=assets,
        )
        if skipped:
            logger.warning(
                "%d soru PDF'e alınamadı (indeks: %s)", len(skipped), skipped
            )
    except latex.LatexNotInstalled as exc:
        # Yapılandırma eksiği, istemci hatası değil.
        logger.error("LaTeX kurulu değil: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="PDF üretimi sunucuda yapılandırılmamış.",
        ) from None
    except (latex.LatexCompileError, Exception) as exc:  # noqa: BLE001
        logger.error("PDF derlenemedi: %s", exc)
        raise HTTPException(
            status_code=500, detail="PDF oluşturulamadı."
        ) from None

    # Dosya adında boşluk ve Türkçe karakter olmasın: bazı tarayıcılar
    # Content-Disposition başlığında bunlarla sorun çıkarıyor.
    safe_course = "".join(
        ch if ch.isalnum() else "_" for ch in request.course
    ).strip("_")
    filename = f"{safe_course}_{request.exam_type}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/questions/{question_id}/figure")
def question_figure(
    question_id: str, _: str = Depends(current_user)
) -> FileResponse:
    """
    Sorunun şeklini servis eder.

    Şekil soruyla birlikte gösteriliyor, ayrı bir istek gerektirmesi tuhaf
    görünebilir — ama görsel ikili veri, JSON yanıtına gömmek (base64) hem
    yanıtı üçte bir oranında şişirir hem de tarayıcının görsel önbelleğinden
    faydalanmayı engeller.
    """
    path = storage.find_figure(question_id)
    if not path:
        raise HTTPException(status_code=404, detail="Şekil bulunamadı.")

    return FileResponse(
        path,
        media_type="image/png",
        # Şekil hiç değişmiyor: bir kez indirilsin, tekrar istenmesin.
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@app.post("/api/questions/{question_id}/solution", response_model=SolutionResponse)
def get_solution(question_id: str, _: str = Depends(current_user)) -> SolutionResponse:
    """
    Sorunun çözümünü döndürür.

    İlk isteyen için LLM çalışıyor, sonrakiler önbellekten alıyor. Havuz
    büyüdükçe çözümlerin çoğu bedava geliyor.
    """
    question = pool.get_question(question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Soru bulunamadı.")

    try:
        solution = solver.solve(question_id, question.prompt)
    except AllProvidersFailed:
        raise HTTPException(
            status_code=503,
            detail="Çözüm üretimi şu an yapılamıyor, birazdan tekrar deneyin.",
        ) from None

    return SolutionResponse(question_id=question_id, solution=solution)


# ----------------------------------------------------------------------- admin


@app.post("/api/admin/upload", response_model=IngestResponse)
async def upload_exam(
    department: str = Form(...),
    course: str = Form(...),
    exam_type: str = Form(...),
    file: UploadFile = File(...),
    admin_id: str = Depends(require_admin),
) -> IngestResponse:
    """
    Referans sınav yükler. Sadece admin.

    Yetki kontrolü şart: yükleme vision'a gidip token harcatabiliyor, yani
    korumasız bırakılırsa herkes bütçeni tüketebilir.
    """
    content = await file.read()
    filename = file.filename or "upload"
    result = extract(filename, content)

    if not result.is_usable:
        raise HTTPException(
            status_code=422,
            detail=f"Dosyadan metin çıkarılamadı. {' '.join(result.notes)}",
        )

    ingested = retrieval.ingest_exam(
        result.text,
        department=department,
        course=course,
        exam_type=exam_type,
        source_name=filename,
    )

    if ingested.nothing_parsed:
        raise HTTPException(
            status_code=422,
            detail="Metin sorulara bölünemedi. Dosya formatını kontrol edin.",
        )

    if ingested.all_duplicates:
        # Hata değil: admin aynı dosyayı ikinci kez yüklemiş. 409 ile
        # "bu kaynak zaten var" diyoruz, panelde uyarı olarak gösteriliyor.
        raise HTTPException(
            status_code=409,
            detail=f"Bu sınav zaten yüklenmiş ({ingested.skipped} soru mevcut).",
        )

    # Dosyayı saklıyoruz: panelde önizleme ve kaynağıyla birlikte silme için.
    # Yalnızca ayrıştırma başarılıysa: başarısız yüklemelerin diskte birikmesi
    # gereksiz.
    storage.save(ingested.document_id, filename, content)

    # Referanslar genişledi: doymuş kombinasyonlar artık yeni soru
    # üretebilir, worker'ın dinlenmesini beklemesine gerek yok.
    reset_backoff()

    return IngestResponse(
        document_id=ingested.document_id,
        chunk_count=ingested.added,
        method=result.method,
        needs_review=result.needs_review,
        notes=result.notes,
    )


@app.get("/api/admin/documents", response_model=list[DocumentOut])
def list_documents(_: str = Depends(require_admin)) -> list[DocumentOut]:
    """Yüklenmiş sınav dosyaları, en yeniden eskiye."""
    return [
        DocumentOut(
            document_id=doc.document_id,
            department=doc.department,
            course=doc.course,
            exam_type=doc.exam_type,
            source_name=doc.source_name,
            uploaded_at=doc.uploaded_at,
            question_count=doc.question_count,
            has_file=storage.find(doc.document_id) is not None,
        )
        for doc in retrieval.list_documents()
    ]


@app.get("/api/admin/documents/{document_id}/file")
def document_file(document_id: str, _: str = Depends(require_admin)) -> FileResponse:
    """
    Yüklenen dosyayı önizleme için servis eder.

    inline (attachment değil): tarayıcı PDF'i indirmek yerine gömülü
    görüntüleyicide açsın, panelde modal içinde gösterebilelim.
    """
    path = storage.find(document_id)
    if not path:
        raise HTTPException(status_code=404, detail="Dosya bulunamadı.")

    return FileResponse(
        path,
        media_type=storage.media_type(path),
        headers={"Content-Disposition": f'inline; filename="{path.name}"'},
    )


@app.delete("/api/admin/documents/{document_id}", status_code=204)
def delete_document(document_id: str, _: str = Depends(require_admin)) -> Response:
    """
    Bir sınavı referanslarıyla ve dosyasıyla birlikte siler.

    Havuzdaki ÜRETİLMİŞ sorulara dokunmuyoruz: onlar kullanıcılara dağıtılmış
    olabilir, referansı silmek geçmişi silmek anlamına gelmemeli. Yalnızca
    bundan sonraki üretimlerde bu referanslar kullanılmıyor.
    """
    removed = retrieval.delete_document(document_id)
    if removed == 0:
        raise HTTPException(status_code=404, detail="Sınav bulunamadı.")

    storage.delete(document_id)
    return Response(status_code=204)


@app.get("/api/admin/pool", response_model=list[PoolStatOut])
def admin_pool(_: str = Depends(require_admin)) -> list[PoolStatOut]:
    """Ders ders havuz durumu: kaç soru hazır."""
    return [PoolStatOut(**row) for row in pool.stats()]


# --- Herkese açık uç noktalar -------------------------------------------------
#
# Bunlar kimlik doğrulaması istemiyor: arama motoru botu da erişebilmeli.
# Soru metinleri yalnızca birkaç örnekle sınırlı; havuzun tamamı korumalı
# kalıyor.


def _slug(course: str, exam_type: str) -> str:
    """
    Ders ve sınav türünü URL parçasına çevirir:
    ("Linear Algebra", "Midterm") -> "linear-algebra-midterm".

    Sınav türü slug'a DAHİL: vize ve final farklı konuları ölçüyor ve farklı
    aramalarla bulunuyor ("linear algebra final questions" ayrı bir arama).
    Tek sayfada sekme yapsaydık ikisi tek adres olarak yarışırdı.

    Ayrıca tür olmadan slug çakışıyordu: aynı dersin vizesi ve finali aynı
    adresi üretiyor, ikincisi erişilemez kalıyordu.
    """
    return "-".join(f"{course} {exam_type}".lower().split())


# Herkese açık sayfa için asgari havuz büyüklüğü.
#
# Sayfada beş örnek soru gösteriliyor. Havuz buna yakınsa vitrin ürünün
# tamamı oluyor: ziyaretçinin kayıt olmak için bir sebebi kalmıyor. Ayrıca
# birkaç soruluk bir sayfa arama motorunda da zayıf içerik sayılıyor.
#
# Bir dersin havuzu bu eşiği hızlı geçiyor — worker on dakikada beş soru
# ekliyor — yani sayfa uzun süre gizli kalmıyor.
PUBLIC_MIN_POOL = 20


@app.get("/public/courses")
def public_courses() -> list[dict]:
    """
    Herkese açık sayfası olan dersler.

    Bölüm dışarı verilmiyor. Ortak dersler tek havuzda toplanıyor
    (shared_courses.py) ve o havuz ilk yükleyenin seçtiği bölümün adıyla
    duruyor — Linear Algebra dört bölümde okutulsa da veritabanında tek bir
    bölüm görünüyor. Bunu sayfada göstermek diğer bölümlerin öğrencisine
    "bu ders benim değil" dedirtirdi. Zaten kimse dersi bölüm adıyla aramıyor.

    Boş ve zayıf havuzlar listede yok: içeriği olmayan sayfa açmıyoruz.
    """
    return [
        {
            "slug": _slug(row["course"], row["exam_type"]),
            "course": row["course"],
            "exam_type": row["exam_type"],
            "question_count": row["total"],
            "updated_at": row["newest"],
        }
        for row in pool.stats()
        if row["total"] >= PUBLIC_MIN_POOL
    ]


@app.get("/public/courses/{slug}")
def public_course_detail(slug: str) -> dict:
    """
    Tek bir dersin herkese açık özeti.

    Konu dağılımı ve birkaç örnek soru. Havuzun tamamı değil: vitrin kadarı.

    Slug'ı ders adına çevirmek yerine mevcut kombinasyonları tarayıp
    eşleştiriyoruz. Tersine çevirmek ("linear-algebra" -> "Linear Algebra")
    büyük harf tahminine dayanırdı ve "Calculus I" gibi adlarda tutmazdı.
    """
    match = next(
        (
            row
            for row in pool.stats()
            if _slug(row["course"], row["exam_type"]) == slug and row["total"] >= PUBLIC_MIN_POOL
        ),
        None,
    )
    if match is None:
        raise HTTPException(status_code=404, detail="Ders bulunamadı")

    department = match["department"]
    course = match["course"]
    exam_type = match["exam_type"]

    return {
        "slug": slug,
        "course": course,
        "exam_type": exam_type,
        "question_count": match["total"],
        "updated_at": match["newest"],
        "topics": pool.topic_breakdown(department, course, exam_type),
        "samples": pool.sample_questions(department, course, exam_type, limit=5),
        # Aynı dersin diğer sınav türleri: sayfada geçiş bağlantısı olarak
        # gösteriliyor. Öğrenci vize sayfasına gelip finali de arayabilir.
        "siblings": [
            {
                "slug": _slug(other["course"], other["exam_type"]),
                "exam_type": other["exam_type"],
            }
            for other in pool.stats()
            if other["course"] == course
            and other["total"] >= PUBLIC_MIN_POOL
        ],
    }