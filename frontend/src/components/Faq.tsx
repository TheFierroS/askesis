"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Sık sorulanlar.
 *
 * Açılır kapanır liste: hepsini açık göstermek sayfayı gereksiz uzatıyor,
 * ziyaretçi de aslında bir iki soruyu merak ediyor.
 *
 * İçerik page.tsx'te değil burada, çünkü metinler uzun ve sayfayı okunmaz
 * hale getiriyordu.
 */

interface FaqItem {
    question: string;
    answer: string;
}

export default function Faq({
    items,
    accentFor,
}: {
    items: FaqItem[];
    /** i. maddenin vurgu rengi — sayfanın üçlü renk düzenine uysun diye. */
    accentFor: (index: number) => string;
}) {
    // Tek bir açık madde: ikisi birden açıkken göz nereye bakacağını
    // şaşırıyor ve liste uzayıp aşağıdaki içeriği itiyor.
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    return (
        <div className="w-full max-w-2xl flex flex-col gap-2">
            {items.map((item, index) => {
                const open = openIndex === index;
                const accent = accentFor(index);

                return (
                    <div
                        key={item.question}
                        className="rounded-2xl border overflow-hidden transition-colors"
                        style={{
                            borderColor: open ? `${accent}55` : "var(--border)",
                            backgroundColor: open
                                ? "var(--bg-elevated)"
                                : "transparent",
                        }}
                    >
                        <button
                            onClick={() => setOpenIndex(open ? null : index)}
                            aria-expanded={open}
                            className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                        >
                            <span
                                className="text-sm md:text-base"
                                style={{
                                    color: open ? accent : "var(--fg)",
                                    fontFamily: "var(--font-heading)",
                                    fontWeight: 400,
                                }}
                            >
                                {item.question}
                            </span>
                            <motion.span
                                animate={{ rotate: open ? 45 : 0 }}
                                transition={{ duration: 0.2 }}
                                className="flex-shrink-0 text-lg leading-none"
                                style={{ color: open ? accent : "var(--fg-faint)" }}
                            >
                                +
                            </motion.span>
                        </button>

                        <AnimatePresence initial={false}>
                            {open && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.25, ease: "easeOut" }}
                                    className="overflow-hidden"
                                >
                                    <p
                                        className="px-5 pb-4 text-sm leading-relaxed"
                                        style={{
                                            color: "var(--fg-muted)",
                                            fontFamily: "var(--font-geist-sans)",
                                        }}
                                    >
                                        {item.answer}
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                );
            })}
        </div>
    );
}