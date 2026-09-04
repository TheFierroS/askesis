"use client";

import { AnimatePresence, motion } from "framer-motion";
import PricingCards from "./PricingCards";

/**
 * Hak bitince açılan satın alma penceresi.
 *
 * Kapatılabiliyor — kullanıcıyı ekranda hapsetmek işe yaramıyor, sinirlendiriyor.
 * Ama kapatıp tekrar soru üretmeye kalkarsa yine açılıyor: mesaj tekrarlanınca
 * anlaşılıyor, engellenince değil.
 *
 * Kapalıyken geçmiş sınavlarına bakmaya devam edebiliyor. Ödediği hakla
 * ürettiği sorulara erişimini kesmek haksızlık olurdu.
 */
export default function PaywallModal({
    open,
    onClose,
    accentFor,
}: {
    open: boolean;
    onClose: () => void;
    accentFor: (index: number) => string;
}) {
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
                        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border px-6 py-7 sm:px-9 sm:py-9"
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
                                color: "var(--accent)",
                                fontFamily: "var(--font-display)",
                            }}
                        >
                            Out of questions
                        </p>

                        <h2
                            className="mt-2 text-xl sm:text-2xl"
                            style={{
                                color: "var(--fg)",
                                fontFamily: "var(--font-heading)",
                                fontWeight: 400,
                            }}
                        >
                            You have used all your credits
                        </h2>

                        <p
                            className="mt-2 mb-7 text-sm leading-relaxed max-w-xl"
                            style={{
                                color: "var(--fg-muted)",
                                fontFamily: "var(--font-geist-sans)",
                            }}
                        >
                            Pick up more to keep generating. Everything you have
                            already made stays in your history, and you can still
                            open those exams and their solutions.
                        </p>

                        <PricingCards accentFor={accentFor} compact />

                        <p
                            className="mt-6 text-xs text-center"
                            style={{
                                color: "var(--fg-faint)",
                                fontFamily: "var(--font-display)",
                            }}
                        >
                            Credits never expire · One credit is one question
                        </p>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}