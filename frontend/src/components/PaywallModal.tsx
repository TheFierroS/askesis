"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Günlük kota penceresi.
 *
 * Eskiden satın alma penceresiydi. Artık paket satmıyoruz: herkesin her gün
 * sıfırlanan bir kotası var, üstüne de yönetici elle hak verebiliyor. Pencere
 * de buna göre "ne kadar kaldı ve ne zaman yenilenecek" sorusunu cevaplıyor.
 *
 * Kapatılabiliyor — kullanıcıyı ekranda hapsetmek işe yaramıyor, sinirlendiriyor.
 * Ama kapatıp tekrar soru üretmeye kalkarsa yine açılıyor: mesaj tekrarlanınca
 * anlaşılıyor, engellenince değil.
 *
 * Kapalıyken geçmiş sınavlarına bakmaya devam edebiliyor. Ürettiği sorulara
 * erişimini kesmek haksızlık olurdu.
 */

/** Sunucu gün sınırını UTC+3'te çiziyor; burada da aynı ofseti kullanıyoruz. */
const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Kotanın yenilenmesine kalan süre.
 *
 * Tarayıcının yerel saatine güvenemiyoruz: kullanıcı başka bir saat diliminde
 * olabilir ya da saati yanlış olabilir. UTC'yi UTC+3'e kaydırıp gün başına ne
 * kaldığını hesaplamak, sunucunun kullandığı sınırla birebir aynı sonucu
 * veriyor.
 */
function msUntilReset(now: number = Date.now()): number {
    const istanbulNow = now + ISTANBUL_OFFSET_MS;
    const sinceMidnight = ((istanbulNow % DAY_MS) + DAY_MS) % DAY_MS;
    return DAY_MS - sinceMidnight;
}

function formatCountdown(ms: number): string {
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (totalMinutes < 1) return "less than a minute";
    if (hours === 0) return `${minutes} min`;
    return `${hours} hr ${minutes} min`;
}

export default function PaywallModal({
    open,
    onClose,
    accentFor,
    dailyLimit = 0,
    dailyLeft = 0,
    bonus = 0,
}: {
    open: boolean;
    onClose: () => void;
    accentFor: (index: number) => string;
    /** Günlük kotanın tamamı. */
    dailyLimit?: number;
    /** Günlük kotadan bugüne kalan. */
    dailyLeft?: number;
    /** Yöneticinin verdiği kalıcı hak. Sıfırlanmıyor. */
    bonus?: number;
}) {
    const accent = accentFor(0);
    const total = dailyLeft + bonus;
    const out = total <= 0;

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={onClose}
                    className="print:hidden fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6"
                    style={{
                        // Arka planı bulanıklaştırıyoruz: modal öne çıksın ama
                        // altındaki ekran tamamen kaybolmasın.
                        backgroundColor: "color-mix(in srgb, var(--bg-deep) 65%, transparent)",
                        backdropFilter: "blur(10px)",
                        WebkitBackdropFilter: "blur(10px)",
                    }}
                >
                    <motion.div
                        initial={{ opacity: 0, y: 24, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 16, scale: 0.97 }}
                        transition={{ type: "spring", stiffness: 260, damping: 26 }}
                        // Modalın içine tıklamak kapatmasın.
                        onClick={(e) => e.stopPropagation()}
                        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border px-6 py-7 sm:px-9 sm:py-9"
                        style={{
                            borderColor: "var(--border)",
                            backgroundColor: "var(--bg-elevated)",
                            boxShadow: "var(--shadow-lg)",
                        }}
                    >
                        <button
                            onClick={onClose}
                            aria-label="Close"
                            className="absolute top-4 right-4 rounded-full border p-1.5 transition-colors hover:border-[var(--border-hover)]"
                            style={{
                                borderColor: "var(--border)",
                                color: "var(--fg-muted)",
                            }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24">
                                <path
                                    d="M6 6l12 12M18 6L6 18"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                    strokeLinecap="round"
                                />
                            </svg>
                        </button>

                        <p
                            className="text-xs uppercase tracking-[0.25em]"
                            style={{
                                color: out ? "var(--danger)" : accent,
                                fontFamily: "var(--font-display)",
                            }}
                        >
                            {out ? "Out of questions" : "Daily quota"}
                        </p>

                        <h2
                            className="mt-2 text-xl sm:text-2xl"
                            style={{
                                color: "var(--fg)",
                                fontFamily: "var(--font-heading)",
                                fontWeight: 400,
                            }}
                        >
                            {out
                                ? "You have used today's questions"
                                : `${total} question${total === 1 ? "" : "s"} left right now`}
                        </h2>

                        <p
                            className="mt-2 text-sm leading-relaxed"
                            style={{
                                color: "var(--fg-muted)",
                                fontFamily: "var(--font-geist-sans)",
                            }}
                        >
                            {out
                                ? "Nothing is lost — everything you have already made stays in your history, and you can still open those exams and their solutions."
                                : "Your daily allowance refills every night. Anything you do not use does not carry over."}
                        </p>

                        {/* Geri sayım: sorunun cevabı bu, o yüzden en görünür
                            eleman. Saat ve dakika yeterli — saniye göstermek
                            bekleme hissini uzatıyor. */}
                        <Countdown accent={accent} dailyLimit={dailyLimit} />

                        {/* Döküm. Kalıcı hakkı olmayan kullanıcıda ikinci satır
                            hiç çizilmiyor: herkeste "0 granted" göstermek
                            gürültü ve olmayan bir şeyi varmış gibi anlatıyor. */}
                        <div className="mt-5 flex flex-col gap-2">
                            <Row
                                label="Daily quota"
                                value={
                                    dailyLimit > 0
                                        ? `${dailyLeft} / ${dailyLimit}`
                                        : String(dailyLeft)
                                }
                                accent={dailyLeft > 0 ? accent : "var(--danger)"}
                            />
                            {bonus > 0 && (
                                <Row
                                    label="Granted to you"
                                    value={String(bonus)}
                                    accent={accent}
                                    note="Does not reset"
                                />
                            )}
                        </div>

                        <p
                            className="mt-6 text-xs text-center"
                            style={{
                                color: "var(--fg-faint)",
                                fontFamily: "var(--font-display)",
                            }}
                        >
                            One question is one credit · Free while in beta
                        </p>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

/**
 * Kotanın yenilenmesine kalan süre.
 *
 * Ayrı bir bileşen olması bilerek: yalnızca pencere açıkken bağlanıyor, yani
 * her açılışta useState'in tembel başlatıcısı taze değeri render sırasında
 * veriyor. Sayacı modalin içinde tutup effect'te ilk değeri atamak, effect
 * içinde senkron setState demek olurdu — React bunu zincirleme render riski
 * olarak işaretliyor.
 */
function Countdown({
    accent,
    dailyLimit,
}: {
    accent: string;
    dailyLimit: number;
}) {
    const [remaining, setRemaining] = useState(() => msUntilReset());

    useEffect(() => {
        // Ekranda dakika görünüyor, saniyede bir güncellemeye gerek yok.
        const timer = setInterval(() => setRemaining(msUntilReset()), 15000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div
            className="mt-6 rounded-xl border px-5 py-4"
            style={{
                borderColor: "var(--border)",
                backgroundColor: "var(--surface)",
            }}
        >
            <p
                className="text-[11px] uppercase tracking-[0.18em]"
                style={{
                    color: "var(--fg-faint)",
                    fontFamily: "var(--font-display)",
                }}
            >
                Next refill
            </p>
            <p
                className="mt-1 text-2xl"
                style={{
                    color: accent,
                    fontFamily: "var(--font-heading)",
                    fontWeight: 400,
                }}
            >
                in {formatCountdown(remaining)}
            </p>
            <p
                className="mt-1 text-xs"
                style={{
                    color: "var(--fg-faint)",
                    fontFamily: "var(--font-geist-sans)",
                }}
            >
                {dailyLimit > 0
                    ? `${dailyLimit} questions land back in your account at midnight.`
                    : "Your allowance resets at midnight."}
            </p>
        </div>
    );
}

function Row({
    label,
    value,
    accent,
    note,
}: {
    label: string;
    value: string;
    accent: string;
    note?: string;
}) {
    return (
        <div
            className="flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5"
            style={{ borderColor: "var(--border)" }}
        >
            <span
                className="text-sm"
                style={{
                    color: "var(--fg-muted)",
                    fontFamily: "var(--font-geist-sans)",
                }}
            >
                {label}
                {note && (
                    <span
                        className="ml-2 text-[11px]"
                        style={{ color: "var(--fg-faint)" }}
                    >
                        {note}
                    </span>
                )}
            </span>
            <span
                className="text-sm whitespace-nowrap"
                style={{
                    color: accent,
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                }}
            >
                {value}
            </span>
        </div>
    );
}