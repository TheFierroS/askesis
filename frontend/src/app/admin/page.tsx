"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SignOutButton, UserButton, useAuth } from "@clerk/nextjs";
import { AnimatePresence, motion } from "framer-motion";
import SelectField from "../../components/SelectField";
import ThemeSwitch from "../../components/ThemeSwitch";
import AuthGuard from "../../components/AuthGuard";
import Logo from "../../components/Logo";
import GenerationLoader from "../../components/GenerationLoader";
import { ToastStack, useToasts } from "../../components/Toast";
import { useThemeColors, accentAt } from "../../components/themeColors";
import {
    ApiError,
    createApi,
    type AdminDocument,
    type CreditAccount,
    type PoolStat,
    type UploadResult,
} from "../../lib/api";
import {
    ALL_GRADES,
    DEPARTMENTS,
    EXAM_TYPES,
    GRADE_OPTIONS,
    coursesFor,
} from "../../lib/courseCatalog";

const FG = "var(--fg)";
const FG_MUTED = "var(--fg-muted)";
const FG_FAINT = "var(--fg-faint)";
const BORDER = "var(--border)";
const SURFACE = "var(--surface)";
const FONT = "var(--font-display)";

/** Metnin hangi katmandan çıktığını kullanıcıya anlaşılır biçimde anlatır. */
const METHOD_LABELS: Record<string, string> = {
    digital: "Text layer (free)",
    ocr: "Tesseract OCR (free)",
    vision: "AI vision (used tokens)",
    plain: "Plain text",
};

function formatDate(iso: string): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function AdminPageContent() {
    const { getToken } = useAuth();
    const c = useThemeColors();
    const api = useMemo(() => createApi(getToken), [getToken]);

    const [documents, setDocuments] = useState<AdminDocument[]>([]);
    const [poolStats, setPoolStats] = useState<PoolStat[]>([]);
    const [accounts, setAccounts] = useState<CreditAccount[]>([]);
    // Hangi kullanıcıya kaç hak yükleneceği — satır bazında tutuluyor.
    const [grantAmounts, setGrantAmounts] = useState<Record<string, string>>({});
    const [granting, setGranting] = useState<string | null>(null);
    const [resetting, setResetting] = useState<string | null>(null);

    // Arama ve filtreler.
    const [userQuery, setUserQuery] = useState("");
    const [filterDepartment, setFilterDepartment] = useState("All departments");
    const [filterGrade, setFilterGrade] = useState(ALL_GRADES);
    const [filterCourse, setFilterCourse] = useState("All courses");
    const [loading, setLoading] = useState(true);
    const [forbidden, setForbidden] = useState(false);
    const { toasts, push: notify, dismiss } = useToasts();

    /**
     * Açık sekme.
     *
     * Üç bölüm tek ekranda alt alta duruyordu ve sayfa uzadıkça hangisine
     * bakacağın belirsizleşiyordu. Sekmeler işi ayırıyor: yükleme yaparken
     * kullanıcı listesi görünmüyor, kullanıcı yönetirken yükleme formu.
     */
    const [tab, setTab] = useState<"uploads" | "users">("uploads");
    const [result, setResult] = useState<UploadResult | null>(null);

    // ---- form ----
    const [department, setDepartment] = useState(DEPARTMENTS[0]);
    const [grade, setGrade] = useState(ALL_GRADES);
    const courses = coursesFor(department, grade);
    const [course, setCourse] = useState("");
    const activeCourse = courses.includes(course) ? course : (courses[0] ?? "");
    const [examType, setExamType] = useState(EXAM_TYPES[0]);
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    // ---- önizleme ----
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewName, setPreviewName] = useState("");

    const refresh = useCallback(() => {
        Promise.all([api.adminDocuments(), api.adminPool(), api.adminCredits()])
            .then(([docs, stats, users]) => {
                setDocuments(docs);
                setPoolStats(stats);
                setAccounts(users);
                setForbidden(false);
            })
            .catch((err: unknown) => {
                // 403: giriş yapmış ama admin değil. Bunu hata gibi göstermek
                // yerine ayrı bir ekranla açıklıyoruz.
                if (err instanceof ApiError && err.status === 403) {
                    setForbidden(true);
                } else if (err instanceof ApiError) {
                    notify(err.message);
                }
            })
            .finally(() => setLoading(false));
    }, [api]);

    useEffect(() => {
        let cancelled = false;
        Promise.all([api.adminDocuments(), api.adminPool(), api.adminCredits()])
            .then(([docs, stats, users]) => {
                if (cancelled) return;
                setDocuments(docs);
                setPoolStats(stats);
                setAccounts(users);
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                if (err instanceof ApiError && err.status === 403) setForbidden(true);
                else if (err instanceof ApiError) notify(err.message);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [api]);

    const handleUpload = async () => {
        if (!file || !activeCourse) return;

        setUploading(true);
                setResult(null);
        try {
            const uploaded = await api.adminUpload({
                department,
                course: activeCourse,
                exam_type: examType,
                file,
            });
            setResult(uploaded);
            setFile(null);
            if (fileInput.current) fileInput.current.value = "";
            refresh();
        } catch (err: unknown) {
            notify(err instanceof ApiError ? err.message : "Upload failed.");
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (doc: AdminDocument) => {
        // Silme geri alınamaz ve referansları yok ediyor; tek onay makul.
        if (
            !window.confirm(
                `Delete "${doc.source_name}"? Its ${doc.question_count} reference questions will be removed.`,
            )
        ) {
            return;
        }

        try {
            await api.adminDeleteDocument(doc.document_id);
            setDocuments((prev) =>
                prev.filter((d) => d.document_id !== doc.document_id),
            );
        } catch (err: unknown) {
            notify(err instanceof ApiError ? err.message : "Delete failed.");
        }
    };

    /**
     * Seçilen dosyayı YÜKLEMEDEN önce gösterir.
     *
     * Dosya zaten tarayıcıda; sunucuya hiç gitmeden nesne URL'i üretebiliyoruz.
     * Yanlış dosyayı yükleyip sonra silmek yerine burada görüp emin olmak hem
     * bir adım kısa hem de yanlış dosya vision'a gidip token harcamıyor.
     */
    const openLocalPreview = () => {
        if (!file) return;
        setPreviewName(file.name);
        setPreviewUrl(URL.createObjectURL(file));
    };

    /**
     * Aranan metne uyan kullanıcılar.
     *
     * İsim, e-posta ve kimlik üzerinden arıyoruz: admin bazen adı, bazen
     * e-postayı, bazen destek talebinden gelen ham kimliği elinde tutuyor.
     */
    const visibleAccounts = useMemo(() => {
        const needle = userQuery.trim().toLowerCase();
        if (!needle) return accounts;

        return accounts.filter((account) =>
            [account.name, account.email, account.user_id]
                .filter(Boolean)
                .some((field) => field.toLowerCase().includes(needle)),
        );
    }, [accounts, userQuery]);

    /**
     * Filtrelenmiş sınav listesi.
     *
     * Sınav sayısı arttıkça tek uzun liste kullanılmaz hale geliyor; aradığın
     * dersi bulmak için kaydırmak yerine seçim yapıyorsun.
     */
    const filterCourses = useMemo(() => {
        if (filterDepartment === "All departments") return [];
        return coursesFor(filterDepartment, filterGrade);
    }, [filterDepartment, filterGrade]);

    const visibleDocuments = useMemo(
        () =>
            documents.filter((doc) => {
                if (
                    filterDepartment !== "All departments" &&
                    doc.department !== filterDepartment
                ) {
                    return false;
                }
                if (filterCourse !== "All courses" && doc.course !== filterCourse) {
                    return false;
                }
                // Sınıf filtresi ders listesi üzerinden çalışıyor: belge
                // kaydında sınıf bilgisi yok, ders adı sınıfı zaten belirliyor.
                if (
                    filterGrade !== ALL_GRADES &&
                    filterCourses.length > 0 &&
                    !filterCourses.includes(doc.course)
                ) {
                    return false;
                }
                return true;
            }),
        [documents, filterDepartment, filterCourse, filterGrade, filterCourses],
    );

    const handleGrant = async (userId: string) => {
        const raw = grantAmounts[userId];
        const amount = Number.parseInt(raw ?? "", 10);

        if (!Number.isFinite(amount) || amount === 0) return;

        setGranting(userId);
                try {
            const result = await api.adminGrantCredits({
                user_id: userId,
                amount,
                reason: amount > 0 ? "manual top-up" : "manual correction",
            });
            // Sunucunun döndürdüğü bakiyeyi kullanıyoruz: kendi hesabımızla
            // tahmin etmek, aradaki bir harcamayı kaçırma riski taşıyor.
            setAccounts((prev) =>
                prev.map((account) =>
                    account.user_id === userId
                        ? {
                              // Yalnızca balance'ı almak yetmiyor: satırın
                              // altındaki döküm eski kalır ve hak verdikten
                              // sonra panel yanlış görünür.
                              ...account,
                              balance: result.balance,
                              bonus: result.bonus,
                              daily_limit: result.daily_limit,
                              daily_used: result.daily_used,
                          }
                        : account,
                ),
            );
            setGrantAmounts((prev) => ({ ...prev, [userId]: "" }));
        } catch (err: unknown) {
            notify(err instanceof ApiError ? err.message : "Could not grant credits.");
        } finally {
            setGranting(null);
        }
    };

    /**
     * Kullanıcının bugünkü kotasını geri verir.
     *
     * Grant'ten farkı kalıcılık: verilen hak kullanıcı bitirene kadar durur ve
     * her gün kotanın üstüne biner. Reset yalnızca o günü telafi ediyor, gece
     * yarısı zaten sıfırlanacağı için ertesi güne bir şey taşımıyor.
     *
     * Kullanım anı: "boşa harcadım" veya "gelen sorular bozuktu" denildiğinde.
     * Bunun için kalıcı hak vermek, telafi ile hediyeyi karıştırmak olurdu.
     */
    const handleResetDay = async (userId: string) => {
        setResetting(userId);
        try {
            const result = await api.adminResetDaily(userId);
            setAccounts((prev) =>
                prev.map((account) =>
                    account.user_id === userId
                        ? {
                              ...account,
                              balance: result.balance,
                              bonus: result.bonus,
                              daily_limit: result.daily_limit,
                              daily_used: result.daily_used,
                          }
                        : account,
                ),
            );
        } catch (err: unknown) {
            notify(err instanceof ApiError ? err.message : "Could not reset the day.");
        } finally {
            setResetting(null);
        }
    };

    const openPreview = async (doc: AdminDocument) => {
        try {
            setPreviewName(doc.source_name);
            setPreviewUrl(await api.adminDocumentUrl(doc.document_id));
        } catch (err: unknown) {
            notify(err instanceof ApiError ? err.message : "Preview failed.");
        }
    };

    const closePreview = () => {
        // Nesne URL'i serbest bırakılmazsa dosya bellekte kalıyor.
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
    };

    if (forbidden) {
        return (
            <main
                className="min-h-screen flex flex-col items-center justify-center gap-4 px-6"
                style={{ backgroundColor: "var(--bg)", color: FG }}
            >
                <p style={{ fontFamily: FONT, fontWeight: 700 }}>Admins only</p>
                <p className="text-sm text-center max-w-sm" style={{ color: FG_MUTED }}>
                    This page manages the reference exams the question generator
                    learns from.
                </p>
                <Link
                    href="/dashboard"
                    className="rounded-full border px-5 py-2 text-sm"
                    style={{ borderColor: BORDER, color: FG, fontFamily: FONT }}
                >
                    Back to dashboard
                </Link>
            </main>
        );
    }

    return (
        <main
            className="relative min-h-screen flex flex-col items-center px-6 py-8"
            style={{ backgroundColor: "var(--bg)", color: FG }}
        >
            {/* ================= ÜST BAR =================
                Solda logo, sağda tema anahtarı ve hesap. Dashboard'a dönüş
                bunların ALTINDA, ortada.

                Önceki hali beş öğeyi tek satıra sıkıştırıyordu: dönüş butonu,
                çıkış, profil, tema anahtarı, logo ve "Admin" yazısı. Kalabalık
                olduğu için hiçbiri öne çıkmıyordu. "Admin" yazısını da
                kaldırdık — sayfanın kendisi zaten admin paneli, başlıkla
                tekrar söylemeye gerek yok. */}
            <div className="w-full max-w-5xl flex items-center justify-between">
                <Logo size={26} />

                <div className="flex items-center gap-3 sm:gap-4">
                    <ThemeSwitch />
                    <SignOutButton redirectUrl="/">
                        <button
                            className="hidden sm:block rounded-full border px-4 py-1.5 text-xs tracking-wide transition-colors hover:border-[var(--border-hover)]"
                            style={{
                                borderColor: BORDER,
                                backgroundColor: SURFACE,
                                color: FG,
                                fontFamily: FONT,
                            }}
                        >
                            Sign Out
                        </button>
                    </SignOutButton>
                    <UserButton appearance={{ elements: { avatarBox: "w-9 h-9" } }} />
                </div>
            </div>

            {/* Dashboard'a dönüş: ikincil bir eylem, üst barda yer kaplamak
                yerine altta ve ortada duruyor. */}
            <Link
                href="/dashboard"
                className="mt-5 rounded-full border px-5 py-2 text-xs tracking-wide transition-colors hover:border-[var(--border-hover)]"
                style={{
                    borderColor: BORDER,
                    backgroundColor: SURFACE,
                    color: FG_MUTED,
                    fontFamily: FONT,
                }}
            >
                ← Back to dashboard
            </Link>

            <ToastStack toasts={toasts} onDismiss={dismiss} />

            <div className="w-full max-w-5xl flex flex-col gap-10 mt-10">
                {/* Sekmeler */}
                <div
                    className="flex items-center gap-1 rounded-full border p-1 self-start"
                    style={{ borderColor: BORDER, backgroundColor: SURFACE }}
                >
                    {(
                        [
                            ["uploads", "Exams & pool"],
                            ["users", "Users & credits"],
                        ] as const
                    ).map(([key, label]) => (
                        <button
                            key={key}
                            onClick={() => setTab(key)}
                            className="rounded-full px-4 py-1.5 text-xs transition-colors"
                            style={{
                                backgroundColor:
                                    tab === key ? "var(--accent-soft)" : "transparent",
                                color: tab === key ? "var(--accent)" : FG_MUTED,
                                fontFamily: FONT,
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* ================= YÜKLEME ================= */}
                {tab === "uploads" && (
                <section className="flex flex-col gap-4">
                    <h2
                        className="text-xl sm:text-2xl"
                        style={{ color: "var(--accent)", fontFamily: "var(--font-heading)" }}
                    >
                        Upload a past exam
                    </h2>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <SelectField
                            label="Department"
                            value={department}
                            options={DEPARTMENTS}
                            onChange={setDepartment}
                            accent={accentAt(c, 0)}
                        />
                        <SelectField
                            label="Grade"
                            value={grade}
                            options={GRADE_OPTIONS}
                            onChange={setGrade}
                            accent={accentAt(c, 1)}
                        />
                        <SelectField
                            label="Course"
                            value={activeCourse}
                            options={courses}
                            onChange={setCourse}
                            accent={accentAt(c, 2)}
                        />
                        <SelectField
                            label="Exam Type"
                            value={examType}
                            options={EXAM_TYPES}
                            onChange={setExamType}
                            accent={accentAt(c, 3)}
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                        <input
                            ref={fileInput}
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
                            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                            className="text-sm file:mr-3 file:rounded-full file:border file:px-4 file:py-1.5 file:text-xs file:bg-transparent file:cursor-pointer"
                            style={{ color: FG_MUTED }}
                        />
                        {file && (
                            <button
                                onClick={openLocalPreview}
                                className="rounded-full border px-4 py-1.5 text-xs transition-colors hover:border-[var(--border-hover)]"
                                style={{ borderColor: BORDER, color: FG, fontFamily: FONT }}
                            >
                                Preview file
                            </button>
                        )}

                        <button
                            onClick={handleUpload}
                            disabled={!file || uploading}
                            className="btn-create-account disabled:opacity-40"
                        >
                            {uploading ? "Processing…" : "Upload"}
                            <div className="icon">
                                <svg height="20" width="20" viewBox="0 0 24 24">
                                    <path
                                        d="M12 19V5M5 12l7-7 7 7"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        fill="none"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </div>
                        </button>
                    </div>

                    {file && !uploading && (
                        <p className="text-xs" style={{ color: FG_FAINT }}>
                            {file.name} · {(file.size / 1024).toFixed(0)} KB
                        </p>
                    )}

                    {uploading && (
                        <div className="flex flex-col items-center gap-3 py-6">
                            <GenerationLoader
                                label="reading"
                                words={[
                                    "the file",
                                    "the questions",
                                    "the topics",
                                    "the pattern",
                                    "the file",
                                ]}
                            />
                            <p className="text-xs" style={{ color: FG_FAINT }}>
                                Scanned files go through AI vision and take longer.
                            </p>
                        </div>
                    )}

                    <AnimatePresence>
                        {result && (
                            <motion.div
                                initial={{ opacity: 0, y: -6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="rounded-xl border px-4 py-3 text-sm"
                                style={{
                                    borderColor: "var(--accent-3)",
                                    backgroundColor: "var(--accent-3-soft)",
                                    color: FG,
                                }}
                            >
                                Added <strong>{result.chunk_count}</strong> reference
                                questions · {METHOD_LABELS[result.method] ?? result.method}
                                {result.needs_review && (
                                    <span style={{ color: "var(--danger)" }}>
                                        {" "}
                                        · needs review
                                    </span>
                                )}
                                {result.notes.length > 0 && (
                                    <span style={{ color: FG_FAINT }}>
                                        {" "}
                                        — {result.notes.join(" ")}
                                    </span>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </section>
                )}

                {tab === "uploads" && (
                <section className="flex flex-col gap-4">
                    <h2
                        className="text-xl sm:text-2xl"
                        style={{ color: "var(--accent-2)", fontFamily: "var(--font-heading)" }}
                    >
                        Question pool
                    </h2>

                    {poolStats.length === 0 ? (
                        <p className="text-sm" style={{ color: FG_FAINT }}>
                            No questions generated yet.
                        </p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {poolStats.map((stat) => (
                                <div
                                    key={`${stat.department}|${stat.course}|${stat.exam_type}`}
                                    className="rounded-xl border px-4 py-3"
                                    style={{
                                        borderColor: BORDER,
                                        backgroundColor: SURFACE,
                                    }}
                                >
                                    <p
                                        className="text-sm"
                                        style={{ color: FG, fontFamily: FONT }}
                                    >
                                        {stat.course}
                                    </p>
                                    <p className="text-xs" style={{ color: FG_FAINT }}>
                                        {stat.exam_type} · {stat.department}
                                    </p>
                                    <p
                                        className="mt-2 text-2xl"
                                        style={{
                                            color: "var(--accent-2)",
                                            fontFamily: FONT,
                                            fontWeight: 700,
                                        }}
                                    >
                                        {stat.total}
                                        <span
                                            className="ml-1 text-xs"
                                            style={{ color: FG_MUTED, fontWeight: 400 }}
                                        >
                                            questions ready
                                        </span>
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
                )}

                {tab === "users" && (
                <section className="flex flex-col gap-4">
                    <h2
                        className="text-xl sm:text-2xl"
                        style={{ color: "var(--accent)", fontFamily: "var(--font-heading)" }}
                    >
                        Users and credits
                    </h2>

                    <input
                        type="search"
                        value={userQuery}
                        onChange={(e) => setUserQuery(e.target.value)}
                        placeholder="Search by name, email or id…"
                        className="w-full max-w-sm rounded-xl border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--accent)]"
                        style={{
                            borderColor: BORDER,
                            backgroundColor: SURFACE,
                            color: FG,
                            fontFamily: "var(--font-geist-sans)",
                        }}
                    />

                    {accounts.length === 0 ? (
                        <p className="text-sm" style={{ color: FG_FAINT }}>
                            No accounts yet. A user appears here the first time they
                            generate an exam.
                        </p>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {visibleAccounts.length === 0 && (
                                <p className="text-sm" style={{ color: FG_FAINT }}>
                                    No user matches “{userQuery}”.
                                </p>
                            )}
                            {visibleAccounts.map((account) => (
                                // Mobilde iki satır: kullanıcı bilgisi üstte,
                                // bakiye ve hak yükleme altta. Tek satıra
                                // sıkıştırıldığında isim tek harfe kadar
                                // kırpılıyordu ve kimin kim olduğu
                                // anlaşılmıyordu.
                                <div
                                    key={account.user_id}
                                    className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border px-4 py-3"
                                    style={{
                                        borderColor: BORDER,
                                        backgroundColor: SURFACE,
                                    }}
                                >
                                    <div className="min-w-0 flex-1">
                                        <p
                                            className="truncate text-sm"
                                            style={{ color: FG, fontFamily: FONT }}
                                        >
                                            {account.name ||
                                                account.email ||
                                                account.user_id}
                                        </p>
                                        <p
                                            className="truncate text-xs"
                                            style={{ color: FG_MUTED }}
                                        >
                                            {account.email || account.user_id}
                                        </p>
                                        <p
                                            className="truncate text-xs"
                                            style={{ color: FG_FAINT }}
                                        >
                                            {account.used_total} questions used ·{" "}
                                            {account.daily_limit - account.daily_used}/
                                            {account.daily_limit} daily left
                                            {/* Kalıcı hakkı olmayanda hiç
                                                yazmıyoruz: çoğu satırda 0
                                                olacak ve "0 granted" gürültü. */}
                                            {account.bonus > 0 &&
                                                ` · ${account.bonus} granted`}{" "}
                                            · joined {formatDate(account.created_at)}
                                        </p>
                                    </div>

                                    {/* İkinci satır: bakiye ve yükleme.
                                        Mobilde kendi satırında, masaüstünde
                                        kullanıcı bilgisinin sağında. */}
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        {/* Kenarlık, kalıcı hakkı olan
                                            kullanıcıyı listede tek bakışta
                                            ayırt etmek için vurgulu. */}
                                        <span
                                            className="rounded-full border px-3 py-1 text-xs whitespace-nowrap"
                                            style={{
                                                borderColor:
                                                    account.balance > 0
                                                        ? account.bonus > 0
                                                            ? "var(--accent)"
                                                            : BORDER
                                                        : "var(--danger)",
                                                color:
                                                    account.balance > 0
                                                        ? "var(--accent)"
                                                        : "var(--danger)",
                                                fontFamily: FONT,
                                                fontWeight: 700,
                                            }}
                                            title={
                                                `${account.daily_limit - account.daily_used} from today's quota` +
                                                (account.bonus > 0
                                                    ? ` + ${account.bonus} granted`
                                                    : "")
                                            }
                                        >
                                            {account.balance} left
                                        </span>

                                        <input
                                            type="number"
                                            value={grantAmounts[account.user_id] ?? ""}
                                            onChange={(e) =>
                                                setGrantAmounts((prev) => ({
                                                    ...prev,
                                                    [account.user_id]: e.target.value,
                                                }))
                                            }
                                            placeholder="+50"
                                            className="w-20 flex-shrink-0 rounded-lg border px-2 py-1.5 text-sm"
                                            style={{
                                                borderColor: BORDER,
                                                backgroundColor: "var(--bg-elevated)",
                                                color: FG,
                                            }}
                                        />
                                        <button
                                            onClick={() => handleGrant(account.user_id)}
                                            disabled={granting === account.user_id}
                                            className="flex-shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors hover:border-[var(--border-hover)] disabled:opacity-40"
                                            style={{ borderColor: BORDER, color: FG }}
                                        >
                                            {granting === account.user_id
                                                ? "…"
                                                : "Grant"}
                                        </button>

                                        {/* Kotasına hiç dokunmamış kullanıcıda
                                            sıfırlanacak bir şey yok, düğmeyi
                                            göstermiyoruz. */}
                                        {account.daily_used > 0 && (
                                            <button
                                                onClick={() =>
                                                    handleResetDay(account.user_id)
                                                }
                                                disabled={
                                                    resetting === account.user_id
                                                }
                                                title="Give back today's quota. Does not touch granted credits."
                                                className="flex-shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors hover:border-[var(--border-hover)] disabled:opacity-40"
                                                style={{
                                                    borderColor: BORDER,
                                                    color: FG_MUTED,
                                                }}
                                            >
                                                {resetting === account.user_id
                                                    ? "…"
                                                    : "Reset day"}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <p className="text-xs" style={{ color: FG_FAINT }}>
                        Everyone gets a daily quota that resets at midnight. What
                        you grant here is permanent — it sits on top of the daily
                        quota and stays until it is used up. Negative numbers
                        subtract; a grant never goes below zero. “Reset day” only
                        gives back today’s quota and leaves granted credits alone.
                    </p>
                </section>
                )}

                {tab === "uploads" && (
                <section className="flex flex-col gap-4 pb-16">
                    <h2
                        className="text-xl sm:text-2xl"
                        style={{ color: "var(--accent-3)", fontFamily: "var(--font-heading)" }}
                    >
                        Uploaded exams
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <SelectField
                            label="Filter by department"
                            value={filterDepartment}
                            options={["All departments", ...DEPARTMENTS]}
                            onChange={(value) => {
                                setFilterDepartment(value);
                                // Bölüm değişince ders filtresi anlamsız kalıyor.
                                setFilterCourse("All courses");
                            }}
                            accent={accentAt(c, 0)}
                        />
                        <SelectField
                            label="Grade"
                            value={filterGrade}
                            options={GRADE_OPTIONS}
                            onChange={(value) => {
                                setFilterGrade(value);
                                setFilterCourse("All courses");
                            }}
                            accent={accentAt(c, 1)}
                        />
                        <SelectField
                            label="Course"
                            value={filterCourse}
                            options={["All courses", ...filterCourses]}
                            onChange={setFilterCourse}
                            accent={accentAt(c, 2)}
                        />
                    </div>

                    {loading ? (
                        <p className="text-sm" style={{ color: FG_FAINT }}>
                            Loading…
                        </p>
                    ) : visibleDocuments.length === 0 && documents.length > 0 ? (
                        <p className="text-sm" style={{ color: FG_FAINT }}>
                            No uploaded exam matches this filter.
                        </p>
                    ) : documents.length === 0 ? (
                        <p className="text-sm" style={{ color: FG_FAINT }}>
                            Nothing uploaded yet. Questions can only be generated for
                            courses that have at least one past exam.
                        </p>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {visibleDocuments.map((doc) => (
                                <div
                                    key={doc.document_id}
                                    // Aynı gerekçe: mobilde dosya adı ve
                                    // butonlar tek satıra sığmıyor.
                                    className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border px-4 py-3"
                                    style={{
                                        borderColor: BORDER,
                                        backgroundColor: SURFACE,
                                    }}
                                >
                                    <div className="min-w-0 flex-1">
                                        <p
                                            className="truncate text-sm"
                                            style={{ color: FG, fontFamily: FONT }}
                                        >
                                            {doc.source_name || "(unnamed)"}
                                        </p>
                                        <p
                                            className="truncate text-xs"
                                            style={{ color: FG_FAINT }}
                                        >
                                            {doc.course} · {doc.exam_type} ·{" "}
                                            {doc.question_count} questions ·{" "}
                                            {formatDate(doc.uploaded_at)}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        {doc.has_file && (
                                            <button
                                                onClick={() => openPreview(doc)}
                                                className="rounded-full border px-3 py-1.5 text-xs transition-colors hover:border-[var(--border-hover)]"
                                                style={{ borderColor: BORDER, color: FG }}
                                            >
                                                Preview
                                            </button>
                                        )}

                                        <button
                                            onClick={() => handleDelete(doc)}
                                            className="rounded-full border px-3 py-1.5 text-xs transition-colors"
                                            style={{
                                                borderColor: "var(--danger)",
                                                color: "var(--danger)",
                                            }}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
                )}
            </div>

            {/* ================= ÖNİZLEME ================= */}
            <AnimatePresence>
                {previewUrl && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={closePreview}
                        className="fixed inset-0 z-50 flex items-center justify-center p-6"
                        style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
                    >
                        <motion.div
                            initial={{ scale: 0.96, y: 10 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.96, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border"
                            style={{
                                borderColor: BORDER,
                                backgroundColor: "var(--bg-elevated)",
                            }}
                        >
                            <div
                                className="flex items-center justify-between border-b px-4 py-3"
                                style={{ borderColor: BORDER }}
                            >
                                <p
                                    className="truncate text-sm"
                                    style={{ color: FG, fontFamily: FONT }}
                                >
                                    {previewName}
                                </p>
                                <button
                                    onClick={closePreview}
                                    className="rounded-full border px-3 py-1 text-xs"
                                    style={{ borderColor: BORDER, color: FG }}
                                >
                                    Close
                                </button>
                            </div>
                            <iframe
                                src={previewUrl}
                                title={previewName}
                                className="flex-1 w-full"
                                style={{ backgroundColor: "#ffffff", border: "none" }}
                            />
                        </motion.div>
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
export default function AdminPage() {
    return (
        <AuthGuard>
            <AdminPageContent />
        </AuthGuard>
    );
}