"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ApiError, type ExamSummary } from "../lib/api";

/**
 * Geçmiş sınavlar paneli.
 *
 * Hesabın karşılığı bu: kullanıcı ürettiği sınavlara sonradan dönebiliyor.
 * Liste kendi verisini kendi çekiyor; dashboard sadece "yenile" sinyali
 * (refreshKey) ve seçim geri çağrılarını veriyor.
 */

const TrashIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
            d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

/** Satırda gösterilen saat. Tarih zaten grup başlığında. */
function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
    });
}

/**
 * Grup başlığı: "Today", "Yesterday" ya da tarih.
 *
 * Göreli ifadeler listeyi taramayı kolaylaştırıyor — "2 Sept" okuyup kafadan
 * hesaplamak yerine "Today" doğrudan anlaşılıyor.
 */
function groupLabel(iso: string): string {
    const date = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    // Saat farkını değil GÜN farkını karşılaştırıyoruz: 23:50'de üretilen
    // sınav 00:10'da "23 saat önce" değil "Yesterday" olmalı.
    const sameDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();

    if (sameDay(date, today)) return "Today";
    if (sameDay(date, yesterday)) return "Yesterday";

    return date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        // Yıl yalnızca farklıysa: aynı yıl içinde gereksiz gürültü.
        year:
            date.getFullYear() === today.getFullYear() ? undefined : "numeric",
    });
}

/** Sınavları tarihe göre, sıralamayı bozmadan gruplar. */
function groupByDay<T extends { created_at: string }>(
    items: T[],
): { label: string; items: T[] }[] {
    const groups: { label: string; items: T[] }[] = [];

    for (const item of items) {
        const label = groupLabel(item.created_at);
        const last = groups[groups.length - 1];

        // Liste zaten yeniden eskiye sıralı geldiği için ardışık aynı etiketleri
        // birleştirmek yeterli; ayrıca sıralamaya gerek yok.
        if (last && last.label === label) {
            last.items.push(item);
        } else {
            groups.push({ label, items: [item] });
        }
    }

    return groups;
}

interface Props {
    api: {
        exams: () => Promise<ExamSummary[]>;
        deleteExam: (id: string) => Promise<void>;
    };
    /** Değeri değiştiğinde liste yeniden çekiliyor. */
    refreshKey: number;
    activeExamId: string | null;
    onOpen: (examId: string) => void;
    onDeleted: (examId: string) => void;
    /** Kurulum ekranına dönmek için. */
    onNewExam: () => void;
}

export default function ExamHistory({
    api,
    refreshKey,
    activeExamId,
    onOpen,
    onDeleted,
    onNewExam,
}: Props) {
    const [exams, setExams] = useState<ExamSummary[]>([]);
    // true ile başlıyor: ilk yükleme sırasında "Loading…" göstermek için.
    // Bir daha true yapılmıyor, bkz. aşağıdaki effect.
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    /**
     * Listeyi yeniden çeker.
     *
     * Effect içinde doğrudan çağırmıyoruz: React'in yeni kuralı, effect
     * gövdesinde senkron setState çağrısını zincirleme render riski olarak
     * işaretliyor. Effect'te .then zinciri + cancelled bayrağı kullanıyoruz;
     * bu fonksiyon yalnızca silme başarısız olduğunda, kullanıcı eyleminden
     * sonra çağrılıyor.
     */
    const reload = useCallback(() => {
        api.exams()
            .then(setExams)
            .catch((err: unknown) => {
                if (!(err instanceof ApiError)) console.error(err);
            });
    }, [api]);

    useEffect(() => {
        // Bileşen sökülürse gelen yanıtı yok say: sökülmüş bileşende state
        // güncellemek React uyarısı üretiyor ve sızıntıya işaret ediyor.
        let cancelled = false;

        // setLoading(true) BİLEREK yok. İki sebeple:
        // 1. React'in kuralı effect gövdesindeki senkron setState'i zincirleme
        //    render riski sayıyor. Aşağıdaki çağrılar await sonrası olduğu için
        //    sorun değil, bu olsaydı sorundu.
        // 2. Liste yenilenirken "Loading…" yazısına dönüp geri gelmesi gereksiz
        //    titreme yaratıyor. Mevcut liste dursun, yenisi gelince değişsin.
        api.exams()
            .then((list) => {
                if (!cancelled) setExams(list);
            })
            .catch((err: unknown) => {
                // Geçmiş listesi ikincil bir özellik; yüklenemezse sayfayı
                // kilitlemek yerine sessizce boş bırakıyoruz.
                if (!cancelled && !(err instanceof ApiError)) console.error(err);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [api, refreshKey]);

    const handleDelete = async (event: React.MouseEvent, examId: string) => {
        // Satıra tıklamak sınavı açıyor; silme butonu o tıklamayı tetiklemesin.
        event.stopPropagation();

        setDeletingId(examId);
        try {
            await api.deleteExam(examId);
            // İyimser güncelleme: sunucu onayladı, listeyi hemen düşür.
            setExams((prev) => prev.filter((exam) => exam.id !== examId));
            onDeleted(examId);
        } catch {
            // Silinemezse listeyi tazeleyip gerçek durumu göster.
            reload();
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="flex h-full flex-col gap-3 p-4">
            {/* Yeni sınav: geçmişteki bir sınavı açtıktan sonra kurulum
                ekranına dönmenin tek yolu sonuncu soruya kadar ilerlemekti.
                Buradan tek tıkla dönülüyor. */}
            <button
                onClick={onNewExam}
                className="flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors hover:border-[var(--border-hover)] hover:bg-[var(--surface-hover)]"
                style={{
                    borderColor: "var(--border)",
                    color: "var(--fg)",
                    fontFamily: "var(--font-display)",
                }}
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path
                        d="M12 5v14M5 12h14"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                    />
                </svg>
                New exam
            </button>

            <p
                className="text-[10px] uppercase tracking-[0.2em] px-2 pt-1"
                style={{ color: "var(--fg-faint)", fontFamily: "var(--font-display)" }}
            >
                Past exams
            </p>

            {loading ? (
                <p className="px-2 text-xs" style={{ color: "var(--fg-faint)" }}>
                    Loading…
                </p>
            ) : exams.length === 0 ? (
                <p
                    className="px-2 text-xs leading-relaxed"
                    style={{ color: "var(--fg-faint)" }}
                >
                    Exams you generate will appear here so you can come back to them.
                </p>
            ) : (
                <div className="flex flex-col gap-4 overflow-y-auto">
                    {groupByDay(exams).map((group) => (
                        <div key={group.label} className="flex flex-col gap-1">
                            {/* Tarih ayracı: ince çizgi + etiket. Çizgi
                                grupları görsel olarak ayırıyor, etiket
                                aramayı kolaylaştırıyor. */}
                            <div className="flex items-center gap-2 px-3 pt-1">
                                <span
                                    className="text-[10px] uppercase tracking-[0.15em] whitespace-nowrap"
                                    style={{
                                        color: "var(--fg-faint)",
                                        fontFamily: "var(--font-display)",
                                    }}
                                >
                                    {group.label}
                                </span>
                                <span
                                    className="h-px flex-1"
                                    style={{ backgroundColor: "var(--border-faint)" }}
                                />
                            </div>

                            <ul className="flex flex-col gap-1">
                                <AnimatePresence initial={false}>
                                    {group.items.map((exam) => {
                                        const active = exam.id === activeExamId;
                                        return (
                                            <motion.li
                                                key={exam.id}
                                                layout
                                                initial={{ opacity: 0, x: -8 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, height: 0 }}
                                                transition={{ duration: 0.18 }}
                                            >
                                                <div
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => onOpen(exam.id)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter")
                                                            onOpen(exam.id);
                                                    }}
                                                    className="group flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--surface-hover)]"
                                                    style={{
                                                        backgroundColor: active
                                                            ? "var(--accent-soft)"
                                                            : "transparent",
                                                        borderLeft: `2px solid ${active ? "var(--accent)" : "transparent"}`,
                                                    }}
                                                >
                                                    <div className="min-w-0 flex-1">
                                                        <p
                                                            className="truncate text-sm"
                                                            style={{
                                                                color: active
                                                                    ? "var(--accent)"
                                                                    : "var(--fg)",
                                                                fontFamily:
                                                                    "var(--font-display)",
                                                            }}
                                                        >
                                                            {exam.course}
                                                        </p>
                                                        <p
                                                            className="truncate text-[11px]"
                                                            style={{
                                                                color: "var(--fg-faint)",
                                                            }}
                                                        >
                                                            {exam.exam_type} ·{" "}
                                                            {exam.question_count} questions
                                                            · {formatTime(exam.created_at)}
                                                        </p>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={(e) =>
                                                            handleDelete(e, exam.id)
                                                        }
                                                        disabled={deletingId === exam.id}
                                                        aria-label={`Delete ${exam.course} exam`}
                                                        className="flex-shrink-0 rounded-lg p-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40"
                                                        style={{ color: "var(--danger)" }}
                                                    >
                                                        <TrashIcon />
                                                    </button>
                                                </div>
                                            </motion.li>
                                        );
                                    })}
                                </AnimatePresence>
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}