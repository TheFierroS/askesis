"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SignOutButton, UserButton, useAuth, useUser } from "@clerk/nextjs";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import SelectField from "../../components/SelectField";
import ThemeSwitch from "../../components/ThemeSwitch";
import AuthGuard from "../../components/AuthGuard";
import ArrowButton from "../../components/ArrowButton";
import GenerationLoader from "../../components/GenerationLoader";
import MathMarkdown from "../../components/MathMarkdown";
import QuestionFigure from "../../components/QuestionFigure";
import { ToastStack, useToasts } from "../../components/Toast";
import PaywallModal from "../../components/PaywallModal";
import ExamHistory from "../../components/ExamHistory";
import Logo from "../../components/Logo";
import { useThemeColors, accentAt } from "../../components/themeColors";
import {
    ApiError,
    createApi,
    type CatalogEntry,
    type CreditBalance,
    type Question,
} from "../../lib/api";
import {
    ALL_GRADES,
    DEPARTMENTS,
    EXAM_TYPES,
    GRADE_OPTIONS,
    buildAvailability,
    coursesFor,
    departmentHasContent,
} from "../../lib/courseCatalog";

const FG = "var(--fg)";
const FG_MUTED = "var(--fg-muted)";
const FG_FAINT = "var(--fg-faint)";
const ACCENT = "var(--accent)";
const SURFACE = "var(--surface)";
const BORDER = "var(--border)";
const BORDER_FAINT = "var(--border-faint)";
const FONT_FAMILY = "var(--font-display)";

type DashboardStage = "setup" | "quiz";

/**
 * Landing'deki üç adımda yapılan seçimler.
 *
 * Modül seviyesinde bir kez okunuyor. useMemo içinde okumak cazipti ama orada
 * sessionStorage.removeItem çağırmak yan etki demek; useMemo'nun saf olması
 * bekleniyor ve React derleyicisi bunu uyarı olarak işaretliyor.
 *
 * Bir kez kullanılıyor: kullanıcı seçimi değiştirip sayfayı yenilediğinde eski
 * seçime geri dönmesin.
 */
interface Onboarding {
    department?: string;
    grade?: string;
    course?: string;
}

let onboardingCache: Onboarding | null | undefined;

function takeOnboarding(): Onboarding | null {
    if (onboardingCache !== undefined) return onboardingCache;
    if (typeof window === "undefined") return null;

    try {
        const raw = sessionStorage.getItem("askesis:onboarding");
        sessionStorage.removeItem("askesis:onboarding");
        onboardingCache = raw ? (JSON.parse(raw) as Onboarding) : null;
    } catch {
        onboardingCache = null;
    }

    return onboardingCache;
}

const ChevronIcon = ({ open }: { open: boolean }) => (
    <motion.svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        animate={{ rotate: open ? 180 : 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
    >
        <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </motion.svg>
);

const SparkIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path
            d="M12 2l1.8 5.6L19.4 9.4 13.8 11.2 12 17l-1.8-5.8L4.6 9.4l5.6-1.8L12 2z"
            fill="currentColor"
        />
    </svg>
);

const ArrowIcon = () => (
    <svg height="20" width="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M0 0h24v24H0z" fill="none" />
        <path
            d="M16.172 11l-5.364-5.364 1.414-1.414L20 12l-7.778 7.778-1.414-1.414L16.172 13H4v-2z"
            fill="currentColor"
        />
    </svg>
);

function DashboardPageContent() {
    const { user } = useUser();
    const { getToken } = useAuth();
    const c = useThemeColors();

    // getToken kimliği her render'da değişebiliyor; api'yi useMemo ile sabitliyoruz
    // ki effect'ler sonsuz döngüye girmesin.
    const api = useMemo(() => createApi(getToken), [getToken]);

    const [stage, setStage] = useState<DashboardStage>("setup");
    // Hatalar sağdan gelen bildirim kartlarıyla veriliyor; satır içi küçük
    // yazı gözden kaçıyordu ve aynı hata tekrarlandığında hiçbir şey
    // değişmediği için buton çalışmıyor sanılıyordu.
    const { toasts, push: notify, dismiss } = useToasts();

    /**
     * Kalan soru hakkı. null = henüz okunmadı.
     *
     * Bildirimi effect'lerden ÖNCE duruyor: const yukarı taşınmıyor, aşağıda
     * tanımlanıp yukarıda kullanılırsa "cannot access before initialization"
     * hatası veriyor.
     */
    const [credits, setCredits] = useState<number | null>(null);
    /**
     * Hakkın dökümü: günlük kotadan ne kaldı, kalıcı hak ne kadar.
     *
     * Üst bardaki rozet tek sayı gösteriyor ama pencere "kotan bitti, yarın
     * yenilenecek" ile "verilen hakkın da bitti" arasındaki farkı ancak
     * dökümle söyleyebiliyor.
     */
    const [allowance, setAllowance] = useState<CreditBalance | null>(null);
    // Hak bitince açılan kota penceresi.
    const [paywallOpen, setPaywallOpen] = useState(false);

    // ---- katalog (hangi ders için sınav yüklenmiş) ----
    const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        api
            .credits()
            .then((result) => {
                if (cancelled) return;
                setCredits(result.balance);
                setAllowance(result);
            })
            .catch(() => {
                // Hak okunamadıysa sayfayı kilitlemiyoruz; üretim denemesinde
                // sunucu zaten 402 döndürür.
            });
        return () => {
            cancelled = true;
        };
    }, [api]);

    useEffect(() => {
        let cancelled = false;
        api
            .catalog()
            .then((entries) => {
                if (!cancelled) setCatalog(entries);
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    notify(
                        err instanceof ApiError
                            ? err.message
                            : "Could not reach the server.",
                    );
                }
            })
            .finally(() => {
                if (!cancelled) setCatalogLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [api]);

    const onboarding = takeOnboarding();
    const [department, setDepartment] = useState(onboarding?.department ?? "");
    // Sınıf yalnızca arayüz filtresi: ders listesini daraltıyor, backend'e
    // gönderilmiyor. Ders adı zaten hangi sınıfa ait olduğunu belirliyor.
    const [grade, setGrade] = useState<string>(onboarding?.grade ?? ALL_GRADES);
    const [course, setCourse] = useState(onboarding?.course ?? "");
    const [examType, setExamType] = useState("");
    const [questionCount, setQuestionCount] = useState(5);

    // Seçenekler İKİ kaynaktan geliyor:
    //   - Listelerin kendisi courseCatalog.ts'ten (programın tamamı)
    //   - Neyin hazır olduğu backend kataloğundan (referansı olan dersler)
    //
    // Kullanıcı bütün bölümleri görüyor; sınavı olmayanlar soluk ve "no exams
    // yet" etiketli. Yine de seçebiliyor, seçerse net bir mesaj alıyor.
    const availability = useMemo(() => buildAvailability(catalog), [catalog]);

    const departments = [...DEPARTMENTS];
    const activeDepartment = departments.includes(department)
        ? department
        : departments[0];

    const grades = GRADE_OPTIONS;
    const activeGrade = grades.includes(grade) ? grade : ALL_GRADES;

    // useMemo yok: coursesFor tek bir dizi birleştirme, her render'da
    // hesaplamak memoization'ın maliyetinden ucuz.
    const courses = coursesFor(activeDepartment, activeGrade);
    const activeCourse = courses.includes(course) ? course : (courses[0] ?? "");

    const examTypes = [...EXAM_TYPES];
    const activeExamType = examTypes.includes(examType)
        ? examType
        : examTypes[0];

    // Hangi seçenekler henüz hazır değil — SelectField bunları soluk çiziyor.
    // Uygunluk ders adı üzerinden: aynı ders birden fazla bölümde okutuluyorsa
    // referanslar paylaşılıyor, birinde hazırsa hepsinde hazır.
    const missingDepartments = departments.filter(
        (d) => !departmentHasContent(d, availability),
    );
    const missingCourses = courses.filter(
        (c2) => !availability.courses.has(c2),
    );
    const missingExamTypes = examTypes.filter(
        (t) => !availability.exams.has(`${activeCourse}|${t}`),
    );

    const selectionReady = availability.exams.has(
        `${activeCourse}|${activeExamType}`,
    );

    // ---- sorular ----
    const [questions, setQuestions] = useState<Question[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [direction, setDirection] = useState(1);
    const [generating, setGenerating] = useState(false);
    const [source, setSource] = useState<"pool" | "generated">("pool");
    // Açık olan sınavın id'si — geçmiş listesinde vurgulamak ve silinince
    // ekranı temizlemek için.
    const [examId, setExamId] = useState<string | null>(null);
    // Değeri artınca geçmiş listesi kendini yeniliyor.
    const [historyKey, setHistoryKey] = useState(0);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    // Kaç soru istenmişti — backend daha az döndürdüyse kullanıcıya sebebini
    // söylüyoruz. Sessizce eksik vermek "site bozuk" izlenimi yaratıyor.
    const [requested, setRequested] = useState(0);

    // ---- çözümler ----
    // Soru id'sine göre saklıyoruz: kullanıcı ileri geri gezerken aynı çözüm
    // için tekrar istek atılmasın.
    const [solutions, setSolutions] = useState<Record<string, string>>({});
    const [solutionLoading, setSolutionLoading] = useState(false);
    const [showSolution, setShowSolution] = useState(false);

    const handleGenerate = async () => {
        if (!activeDepartment || !activeCourse || !activeExamType) return;

        // Hakkı bitmişse sunucuya gitmeden pencereyi açıyoruz. Kullanıcı
        // pencereyi kapatıp tekrar bastığında yeniden açılıyor: mesaj
        // tekrarlanınca anlaşılıyor.
        if (credits !== null && credits <= 0) {
            setPaywallOpen(true);
            return;
        }

                setGenerating(true);
        try {
            const result = await api.createExam({
                department: activeDepartment,
                course: activeCourse,
                exam_type: activeExamType,
                num_questions: questionCount,
            });
            setQuestions(result.questions);
            setSource(result.source);
            setRequested(result.requested);
            setExamId(result.exam_id);
            setCredits(result.credits_left);
            // Sınav yanıtı yalnızca toplamı taşıyor. Dökümü ayrıca çekiyoruz
            // ki pencere açıldığında "kotadan mı verilen haktan mı bitti"
            // doğru görünsün. Sessizce başarısız olabilir: rozet zaten güncel.
            api.credits()
                .then(setAllowance)
                .catch(() => {});
            setHistoryKey((k) => k + 1);
            setSolutions({});
            setCurrentIndex(0);
            setShowSolution(false);
            setDirection(1);
            setStage("quiz");
        } catch (err: unknown) {
            // 404 = bu kombinasyon için referans sınav yok. Backend'in Türkçe
            // mesajını olduğu gibi göstermek yerine arayüz diline çeviriyoruz
            // ve ne yapılabileceğini söylüyoruz.
            if (err instanceof ApiError && err.status === 402) {
                setCredits(0);
                setPaywallOpen(true);
                api.credits()
                    .then((result) => {
                        setCredits(result.balance);
                        setAllowance(result);
                    })
                    .catch(() => {});
            } else if (err instanceof ApiError && err.status === 404) {
                notify(
                    `No past exams have been uploaded for ${activeCourse} · ${activeExamType} yet. Pick another course, or check back later.`,
                );
            } else if (err instanceof ApiError && err.status === 503) {
                notify(
                    "The question service is busy right now. Please try again in a minute.",
                );
            } else {
                notify(
                    err instanceof ApiError
                        ? err.message
                        : "Could not reach the server. Check your connection.",
                );
            }
        } finally {
            setGenerating(false);
        }
    };

    const currentQuestion = questions[currentIndex];

    const handleToggleSolution = async () => {
        if (!currentQuestion) return;

        if (showSolution) {
            setShowSolution(false);
            return;
        }

        setShowSolution(true);
        if (solutions[currentQuestion.id]) return;

        setSolutionLoading(true);
        try {
            const result = await api.solution(currentQuestion.id);
            setSolutions((prev) => ({
                ...prev,
                [currentQuestion.id]: result.solution,
            }));
        } catch (err: unknown) {
            notify(err instanceof ApiError ? err.message : "Could not load the solution.");
            setShowSolution(false);
        } finally {
            setSolutionLoading(false);
        }
    };

    const handleNewExam = () => {
        setStage("setup");
        setQuestions([]);
        setCurrentIndex(0);
        setShowSolution(false);
                setExamId(null);
    };

    const handleOpenExam = async (id: string) => {
                setSidebarOpen(false);
        try {
            const detail = await api.exam(id);
            setQuestions(detail.questions);
            // Geçmişten açılan sınav zaten üretilmiş; istenen sayı = gelen sayı,
            // böylece "eksik soru" uyarısı boşuna çıkmıyor.
            setRequested(detail.questions.length);
            setSource("pool");
            setExamId(detail.exam.id);
            setDepartment(detail.exam.department);
            setCourse(detail.exam.course);
            setExamType(detail.exam.exam_type);
            setSolutions({});
            setCurrentIndex(0);
            setShowSolution(false);
            setDirection(1);
            setStage("quiz");
        } catch (err: unknown) {
            notify(
                err instanceof ApiError ? err.message : "Exam could not be opened.",
            );
        }
    };

    const handleExamDeleted = (deletedId: string) => {
        // Ekranda açık olan sınav silindiyse kurulum ekranına dön —
        // olmayan bir sınavın sorularını göstermeye devam etmek yanıltıcı.
        if (deletedId === examId) handleNewExam();
    };

    const goNext = useCallback(() => {
        setShowSolution(false);
        setDirection(1);
        setCurrentIndex((i) => Math.min(i + 1, questions.length - 1));
    }, [questions.length]);

    const goPrev = useCallback(() => {
        setShowSolution(false);
        setDirection(-1);
        setCurrentIndex((i) => Math.max(i - 1, 0));
    }, []);

    useEffect(() => {
        if (stage !== "quiz") return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "ArrowRight") goNext();
            if (e.key === "ArrowLeft") goPrev();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [stage, goNext, goPrev]);

    const [pdfLoading, setPdfLoading] = useState(false);

    const handleSavePdf = async () => {
        if (!questions.length) return;

        setPdfLoading(true);
                try {
            const blob = await api.examPdf({
                question_ids: questions.map((q) => q.id),
                course: activeCourse,
                exam_type: activeExamType,
            });

            // Blob'u indirilebilir bir bağlantıya çevirip tıklıyoruz.
            // Tarayıcıda dosya indirmenin standart yolu bu; sunucudan gelen
            // ikili veriyi doğrudan diske yazmanın başka yolu yok.
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `${activeCourse}_${activeExamType}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            // Bellek sızıntısını önlemek için nesne URL'ini serbest bırak.
            URL.revokeObjectURL(url);
        } catch (err: unknown) {
            notify(
                err instanceof ApiError ? err.message : "The PDF could not be created.",
            );
        } finally {
            setPdfLoading(false);
        }
    };

    const isLastQuestion = currentIndex === questions.length - 1;
    const progress = questions.length
        ? ((currentIndex + 1) / questions.length) * 100
        : 0;
    const qColor = accentAt(c, currentIndex);

    const cardVariants: Variants = {
        enter: (dir: number) => ({
            opacity: 0,
            scale: 0.82,
            y: 28,
            rotate: dir >= 0 ? 6 : -6,
            x: dir >= 0 ? 46 : -46,
        }),
        center: {
            opacity: 1,
            scale: 1,
            y: 0,
            rotate: 0,
            x: 0,
            transition: {
                type: "spring",
                stiffness: 240,
                damping: 24,
                mass: 0.9,
                when: "beforeChildren",
                staggerChildren: 0.08,
                delayChildren: 0.1,
            },
        },
        exit: (dir: number) => ({
            opacity: 0,
            scale: 0.88,
            rotate: dir >= 0 ? -7 : 7,
            x: dir >= 0 ? -80 : 80,
            transition: { duration: 0.22, ease: "easeIn" },
        }),
    };

    const cardItemVariants: Variants = {
        enter: { opacity: 0, y: 12 },
        center: { opacity: 1, y: 0, transition: { duration: 0.32, ease: "easeOut" } },
    };

    return (
        <main
            className="relative min-h-screen flex flex-col items-center px-6 py-8 overflow-hidden lg:pl-72 print:lg:pl-0"
            style={{ backgroundColor: "var(--bg)", color: FG }}
        >
            <div
                className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[640px] h-[640px] rounded-full opacity-40 blur-3xl"
                style={{ background: "var(--glow)" }}
            />

            {/* ================= GEÇMİŞ (masaüstü) ================= */}
            <aside
                className="print:hidden fixed left-0 top-0 z-30 hidden h-full w-64 border-r lg:block"
                style={{
                    borderColor: "var(--border)",
                    backgroundColor: "var(--bg-elevated)",
                }}
            >
                <ExamHistory
                    api={api}
                    refreshKey={historyKey}
                    activeExamId={examId}
                    onOpen={handleOpenExam}
                    onDeleted={handleExamDeleted}
                    onNewExam={handleNewExam}
                />
            </aside>

            {/* ================= GEÇMİŞ (mobil çekmece) ================= */}
            <AnimatePresence>
                {sidebarOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSidebarOpen(false)}
                            className="fixed inset-0 z-40 lg:hidden"
                            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
                        />
                        <motion.aside
                            initial={{ x: -280 }}
                            animate={{ x: 0 }}
                            exit={{ x: -280 }}
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            className="fixed left-0 top-0 z-50 h-full w-64 border-r lg:hidden"
                            style={{
                                borderColor: "var(--border)",
                                backgroundColor: "var(--bg-elevated)",
                            }}
                        >
                            <ExamHistory
                                api={api}
                                refreshKey={historyKey}
                                activeExamId={examId}
                                onOpen={handleOpenExam}
                                onDeleted={handleExamDeleted}
                                onNewExam={() => {
                                    handleNewExam();
                                    setSidebarOpen(false);
                                }}
                            />
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>

            {/* ================= TOP BAR ================= */}
            <div className="w-full flex items-center justify-between gap-2 max-w-6xl relative z-10 print:hidden">
                {/* Sol: marka. Mobilde geçmiş çekmecesini açan buton da burada. */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        aria-label="Open past exams"
                        className="lg:hidden rounded-full border p-2 transition-colors hover:border-[var(--border-hover)]"
                        style={{ borderColor: BORDER, color: FG }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path
                                d="M4 6h16M4 12h16M4 18h16"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                            />
                        </svg>
                    </button>
                    {/* Tek çağrı yeter: adı mobilde gizlemeyi Logo'nun
                        kendisi hallediyor. */}
                    <Logo size={26} />
                </div>

                {/* Sağ: hesap. Profil ve çıkış birlikte duruyor — ikisi de aynı
                    işin parçası, ekranın iki ucuna dağılmaları kafa karıştırıyordu. */}
                <div className="flex items-center gap-2 sm:gap-3">
                    {/* Kalan hak: kullanıcı ne kadar kaldığını her an görsün,
                        sıfırlandığında sürpriz olmasın.

                        Mobilde de görünüyor. Eskiden `hidden sm:flex` idi ve
                        telefonda hakkının bittiğini ancak üretmeye çalışınca
                        öğreniyordun — kotanın anlamı tam da her an görünür
                        olması. Dar ekranda yalnızca "left" kelimesi düşüyor,
                        sayı kalıyor. */}
                    {credits !== null && (
                        <button
                            onClick={() => setPaywallOpen(true)}
                            className="flex items-center gap-1 sm:gap-1.5 rounded-full border px-2.5 sm:px-3 py-1.5 text-xs transition-colors hover:border-[var(--border-hover)]"
                            style={{
                                borderColor:
                                    credits > 5
                                        ? BORDER
                                        : "color-mix(in srgb, var(--danger) 50%, transparent)",
                                color: credits > 5 ? FG_MUTED : "var(--danger)",
                                fontFamily: FONT_FAMILY,
                            }}
                            title="Questions you can still generate today"
                        >
                            <span
                                style={{
                                    color: credits > 5 ? ACCENT : "inherit",
                                    fontWeight: 700,
                                }}
                            >
                                {credits}
                            </span>
                            <span className="hidden sm:inline">left</span>
                        </button>
                    )}
                    <ThemeSwitch />
                    {/* Sign Out mobilde gizli: profil menüsünün içinde zaten
                        çıkış var ve üst bar orada çok sıkışıyordu. */}
                    <SignOutButton redirectUrl="/">
                        <button
                            className="hidden sm:block rounded-full border px-4 py-1.5 text-xs tracking-wide transition-colors hover:border-[var(--border-hover)]"
                            style={{
                                borderColor: BORDER,
                                backgroundColor: SURFACE,
                                color: FG,
                                fontFamily: FONT_FAMILY,
                            }}
                        >
                            Sign Out
                        </button>
                    </SignOutButton>
                    <UserButton appearance={{ elements: { avatarBox: "w-9 h-9" } }} />
                </div>
            </div>

            <ToastStack toasts={toasts} onDismiss={dismiss} />

            <PaywallModal
                open={paywallOpen}
                onClose={() => setPaywallOpen(false)}
                accentFor={(i) => accentAt(c, i)}
                dailyLimit={allowance?.daily_limit ?? 0}
                dailyLeft={allowance?.daily_left ?? 0}
                bonus={allowance?.bonus ?? 0}
            />

            <AnimatePresence mode="wait">
                {/* ================= SETUP ================= */}
                {stage === "setup" && (
                    <motion.div
                        key="setup"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={{ duration: 0.35, ease: "easeOut" }}
                        className="w-full max-w-4xl flex flex-col items-center gap-10 mt-16 relative z-10"
                    >
                        <p
                            className="text-sm"
                            style={{ color: FG_MUTED, fontFamily: FONT_FAMILY }}
                        >
                            Welcome, {user?.firstName ?? "there"}.
                        </p>

                        {catalogLoading ? (
                            <GenerationLoader
                                label="loading"
                                words={[
                                    "departments",
                                    "courses",
                                    "exam types",
                                    "your history",
                                    "departments",
                                ]}
                                className="mt-16"
                            />
                        ) : generating ? (
                            /* Üretim sürerken seçim alanları kalkıyor: kullanıcı
                               zaten seçimini yaptı, ekranda tek bir şeyin
                               olması beklemeyi kısaltıyor. */
                            <GenerationLoader className="mt-24" />
                        ) : (
                            <>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                                    <SelectField
                                        label="Department"
                                        value={activeDepartment}
                                        options={departments}
                                        onChange={setDepartment}
                                        accent={accentAt(c, 0)}
                                        unavailable={missingDepartments}
                                    />
                                    <SelectField
                                        label="Grade"
                                        value={activeGrade}
                                        options={grades}
                                        onChange={setGrade}
                                        accent={accentAt(c, 1)}
                                    />
                                    <SelectField
                                        label="Course"
                                        value={activeCourse}
                                        options={courses}
                                        onChange={setCourse}
                                        accent={accentAt(c, 2)}
                                        unavailable={missingCourses}
                                    />
                                    <SelectField
                                        label="Exam Type"
                                        value={activeExamType}
                                        options={examTypes}
                                        onChange={setExamType}
                                        accent={accentAt(c, 3)}
                                        unavailable={missingExamTypes}
                                    />
                                </div>

                                <div className="w-full max-w-md flex flex-col items-center gap-3">
                                    <div
                                        className="flex items-center justify-between w-full text-xs"
                                        style={{ color: FG_MUTED, fontFamily: FONT_FAMILY }}
                                    >
                                        <span>
                                            Number of questions
                                            {credits !== null && credits < 10 && (
                                                <span
                                                    style={{
                                                        color: "var(--danger)",
                                                        marginLeft: 6,
                                                    }}
                                                >
                                                    ({credits} left)
                                                </span>
                                            )}
                                        </span>
                                        <span style={{ color: ACCENT, fontWeight: 700 }}>
                                            {questionCount}
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min={1}
                                        max={10}
                                        value={questionCount}
                                        onChange={(e) =>
                                            setQuestionCount(Number(e.target.value))
                                        }
                                        className="w-full"
                                    />
                                </div>

                                {!selectionReady && (
                                    <p
                                        className="text-xs text-center max-w-sm"
                                        style={{ color: FG_FAINT, fontFamily: FONT_FAMILY }}
                                    >
                                        No past exams uploaded for this selection yet.
                                        You can still try, but questions may not be
                                        available.
                                    </p>
                                )}

                                <motion.button
                                    onClick={handleGenerate}
                                    whileHover={{ scale: 1.03 }}
                                    whileTap={{ scale: 0.97 }}
                                    transition={{
                                        type: "spring",
                                        stiffness: 400,
                                        damping: 25,
                                    }}
                                    className="btn-create-account"
                                >
                                    Generate Questions
                                    <div className="icon">
                                        <ArrowIcon />
                                    </div>
                                </motion.button>
                            </>
                        )}
                    </motion.div>
                )}

                {/* ================= QUIZ ================= */}
                {stage === "quiz" && currentQuestion && (
                    <motion.div
                        key="quiz"
                        initial={{ opacity: 0, y: 26, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -18, scale: 0.97 }}
                        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                        className="w-full max-w-4xl flex flex-col items-center gap-6 mt-14 relative z-10"
                    >
                        <div className="w-full flex flex-col gap-2 print:hidden">
                            <div className="flex items-center justify-between">
                                <span
                                    className="text-xs tracking-[0.2em]"
                                    style={{ color: qColor, fontFamily: FONT_FAMILY }}
                                >
                                    QUESTION {currentIndex + 1} OF {questions.length}
                                </span>
                                <span
                                    className="text-xs"
                                    style={{ color: FG_FAINT, fontFamily: FONT_FAMILY }}
                                >
                                    {activeCourse} · {activeExamType}
                                    {source === "generated" && " · freshly generated"}
                                </span>
                            </div>
                            <div
                                className="w-full h-[3px] rounded-full overflow-hidden"
                                style={{ backgroundColor: BORDER }}
                            >
                                <motion.div
                                    className="h-full rounded-full"
                                    style={{
                                        backgroundImage:
                                            "linear-gradient(90deg, var(--accent) 0%, var(--accent-2) 55%, var(--accent-3) 100%)",
                                    }}
                                    animate={{ width: `${progress}%` }}
                                    transition={{ duration: 0.4, ease: "easeOut" }}
                                />
                            </div>
                        </div>

                        {questions.length < requested && (
                            <p
                                className="print:hidden text-xs text-center max-w-lg"
                                style={{ color: FG_FAINT, fontFamily: FONT_FAMILY }}
                            >
                                Showing {questions.length} of the {requested} questions
                                you asked for. There aren&apos;t enough past exams for
                                this course yet to make more distinct questions.
                            </p>
                        )}

                        {/* items-start: çözüm açılınca kart aşağı doğru büyüyor.
                            items-center olsaydı oklar da aşağı kayardı; şimdi
                            sorunun hizasında sabit duruyorlar. */}
                        {/* Mobilde oklar yanlarda ~90px yiyordu ve kart öyle
                            daralıyordu ki matrisler taşıyordu. Küçük ekranda
                            kart tam genişlik alıyor, oklar altına iniyor. */}
                        <div className="flex items-start gap-3 sm:gap-5 w-full">
                            {/* Sabit yükseklikte bir kutu içinde ortalanıyor.
                                Kutu kartın en az yüksekliği kadar (360px); çözüm
                                açılıp kart uzadığında oklar bu kutunun içinde
                                kaldığı için yerinden kıpırdamıyor. */}
                            <div className="print:hidden hidden sm:flex h-[360px] items-center">
                                <ArrowButton
                                    direction="back"
                                    onClick={goPrev}
                                    disabled={currentIndex === 0}
                                    label="Previous question"
                                />
                            </div>

                            <div
                                // min-w-0: flex öğesi varsayılan olarak
                                // içeriğinden küçülemiyor ve geniş formüller
                                // kartı ekrandan taşırıyordu.
                                className="flex-1 min-w-0 relative sm:min-h-[360px]"
                                style={{ perspective: 1200 }}
                            >
                                {/* Arkadaki deste yalnızca masaüstünde.
                                    Mobilde kart kısa kalıyor, deste ise sabit
                                    yükseklikte olduğu için altta boş bir kutu
                                    gibi görünüyordu. */}
                                <div
                                    aria-hidden
                                    className="print:hidden hidden sm:block absolute inset-0 rounded-2xl border pointer-events-none"
                                    style={{
                                        borderColor: BORDER_FAINT,
                                        backgroundColor: SURFACE,
                                        opacity: 0.4,
                                        transform:
                                            "translateY(16px) scale(0.93) rotate(-2.5deg)",
                                    }}
                                />
                                <div
                                    aria-hidden
                                    className="print:hidden hidden sm:block absolute inset-0 rounded-2xl border pointer-events-none"
                                    style={{
                                        borderColor: BORDER_FAINT,
                                        backgroundColor: SURFACE,
                                        opacity: 0.7,
                                        transform:
                                            "translateY(8px) scale(0.965) rotate(1.5deg)",
                                    }}
                                />

                                <AnimatePresence mode="popLayout" custom={direction}>
                                    <motion.div
                                        key={currentQuestion.id}
                                        custom={direction}
                                        variants={cardVariants}
                                        initial="enter"
                                        animate="center"
                                        exit="exit"
                                        className="relative z-10 rounded-[1.4rem] border px-4 py-6 sm:px-12 sm:py-11 flex flex-col gap-6 sm:gap-8"
                                        style={{
                                            borderColor: `${qColor}33`,
                                            borderTopWidth: 3,
                                            borderTopColor: qColor,
                                            backgroundColor: "var(--bg-elevated)",
                                            boxShadow: "var(--shadow-lg)",
                                            transformOrigin: "bottom center",
                                        }}
                                    >
                                        <motion.div
                                            variants={cardItemVariants}
                                            className="flex items-center gap-3"
                                        >
                                            <span
                                                className="flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold"
                                                style={{
                                                    backgroundColor: `${qColor}22`,
                                                    color: qColor,
                                                    fontFamily: FONT_FAMILY,
                                                }}
                                            >
                                                {currentIndex + 1}
                                            </span>
                                            <span
                                                className="text-xs"
                                                style={{
                                                    color: FG_FAINT,
                                                    fontFamily: FONT_FAMILY,
                                                }}
                                            >
                                                {currentQuestion.topic} ·{" "}
                                                {currentQuestion.difficulty}
                                            </span>
                                            <div
                                                className="h-px flex-1"
                                                style={{ backgroundColor: `${qColor}33` }}
                                            />
                                        </motion.div>

                                        {/* Şekil metnin ÜSTÜNDE: sınav
                                            kağıtlarında yerleşim böyle. Öğrenci
                                            önce şekle bakıp sonra ne istendiğini
                                            okuyor. */}
                                        {currentQuestion.has_figure && (
                                            <motion.div variants={cardItemVariants}>
                                                <QuestionFigure
                                                    questionId={currentQuestion.id}
                                                    fetchUrl={api.figureUrl}
                                                />
                                            </motion.div>
                                        )}

                                        <motion.div variants={cardItemVariants}>
                                            <MathMarkdown className="text-lg">
                                                {currentQuestion.prompt}
                                            </MathMarkdown>
                                        </motion.div>

                                        <motion.div
                                            variants={cardItemVariants}
                                            className="flex flex-col gap-3"
                                        >
                                            <button
                                                onClick={handleToggleSolution}
                                                disabled={solutionLoading}
                                                className="print:hidden self-start flex items-center gap-2 rounded-full px-5 py-2.5 text-xs tracking-wide transition-[background-color,border-color,color,transform] duration-200 hover:-translate-y-px active:scale-[0.97] disabled:opacity-50"
                                                style={{
                                                    color: showSolution
                                                        ? "var(--accent-3)"
                                                        : FG,
                                                    fontFamily: FONT_FAMILY,
                                                    backgroundColor: showSolution
                                                        ? "var(--accent-3-soft)"
                                                        : "transparent",
                                                    border: `1px solid ${showSolution ? "var(--accent-3)" : BORDER}`,
                                                }}
                                            >
                                                <SparkIcon />
                                                {solutionLoading
                                                    ? "Working on it…"
                                                    : showSolution
                                                      ? "Hide Solution"
                                                      : "Show Solution"}
                                                <ChevronIcon open={showSolution} />
                                            </button>

                                            <AnimatePresence>
                                                {showSolution && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{
                                                            opacity: 1,
                                                            height: "auto",
                                                        }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        transition={{
                                                            duration: 0.3,
                                                            ease: "easeOut",
                                                        }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div
                                                            className="rounded-xl px-5 py-4 mt-1"
                                                            style={{
                                                                backgroundColor:
                                                                    "var(--accent-3-soft)",
                                                                borderLeft:
                                                                    "2px solid var(--accent-3)",
                                                            }}
                                                        >
                                                            {solutionLoading ? (
                                                                <p
                                                                    className="text-sm"
                                                                    style={{ color: FG_MUTED }}
                                                                >
                                                                    The professor is writing it
                                                                    out…
                                                                </p>
                                                            ) : (
                                                                <MathMarkdown className="text-sm">
                                                                    {solutions[
                                                                        currentQuestion.id
                                                                    ] ?? ""}
                                                                </MathMarkdown>
                                                            )}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </motion.div>
                                    </motion.div>
                                </AnimatePresence>
                            </div>

                            <div className="print:hidden hidden sm:flex h-[360px] items-center">
                                <ArrowButton
                                    direction="forward"
                                    onClick={goNext}
                                    disabled={isLastQuestion}
                                    label="Next question"
                                />
                            </div>
                        </div>

                        {/* Mobil gezinme: kartın altında, ortada. */}
                        <div className="print:hidden flex sm:hidden items-center justify-center gap-8">
                            <ArrowButton
                                direction="back"
                                onClick={goPrev}
                                disabled={currentIndex === 0}
                                label="Previous question"
                            />
                            <ArrowButton
                                direction="forward"
                                onClick={goNext}
                                disabled={isLastQuestion}
                                label="Next question"
                            />
                        </div>

                        <AnimatePresence>
                            {isLastQuestion && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.35, ease: "easeOut" }}
                                    className="print:hidden flex items-center gap-3 mt-2"
                                >
                                    <motion.button
                                        onClick={handleNewExam}
                                        whileTap={{ scale: 0.97 }}
                                        className="rounded-full border px-6 py-3 text-sm tracking-wide transition-colors hover:border-[var(--border-hover)] hover:bg-[var(--surface-hover)]"
                                        style={{
                                            borderColor: BORDER,
                                            color: FG,
                                            fontFamily: FONT_FAMILY,
                                            backgroundColor: SURFACE,
                                        }}
                                    >
                                        New Exam
                                    </motion.button>

                                    <motion.button
                                        onClick={handleSavePdf}
                                        disabled={pdfLoading}
                                        whileTap={{ scale: 0.97 }}
                                        className="btn-create-account disabled:opacity-50"
                                    >
                                        {pdfLoading ? "Preparing…" : "Save as PDF"}
                                        <div className="icon">
                                            <ArrowIcon />
                                        </div>
                                    </motion.button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>
        </main>
    );
}


/**
 * Sayfanın dışarıya açılan hali.
 *
 * İçerik AuthGuard'ın altında: oturum çözülene kadar hiçbir şey çizilmiyor,
 * oturum düşerse ana sayfaya yönlendiriliyor. Middleware sunucu tarafında
 * zaten kapıyı tutuyor; bu, istemci tarafındaki ikinci kilit.
 */
export default function DashboardPage() {
    return (
        <AuthGuard>
            <DashboardPageContent />
        </AuthGuard>
    );
}