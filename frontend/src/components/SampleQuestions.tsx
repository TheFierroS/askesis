"use client";

import { useState } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import MathMarkdown from "./MathMarkdown";
import ArrowButton from "./ArrowButton";
import { SAMPLE_QUESTIONS } from "../lib/sampleQuestions";

/**
 * Örnek soru karuseli.
 *
 * Tek bir soru göstermek "belki de en iyisini seçtiler" izlenimi bırakıyordu.
 * Birkaçını gezdirmek hem çeşitliliği hem tutarlılığı gösteriyor.
 *
 * Kart tasarımı dashboard'daki soru kartıyla bilerek aynı: ziyaretçi giriş
 * yaptığında tanıdık bir ekranla karşılaşıyor.
 */
export default function SampleQuestions({
    accentFor,
}: {
    /** i. sorunun vurgu rengi — sayfanın üçlü renk düzenine uysun diye. */
    accentFor: (index: number) => string;
}) {
    const [index, setIndex] = useState(0);
    const [direction, setDirection] = useState(1);

    const question = SAMPLE_QUESTIONS[index];
    const accent = accentFor(index);

    const go = (step: number) => {
        setDirection(step);
        setIndex((current) => {
            const next = current + step;
            // Başa/sona sarma: uçlarda buton pasifleştirmek yerine döngü,
            // gezinmeyi akıcı tutuyor.
            if (next < 0) return SAMPLE_QUESTIONS.length - 1;
            if (next >= SAMPLE_QUESTIONS.length) return 0;
            return next;
        });
    };

    const variants: Variants = {
        enter: (dir: number) => ({ opacity: 0, x: dir >= 0 ? 40 : -40 }),
        center: {
            opacity: 1,
            x: 0,
            transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
        },
        exit: (dir: number) => ({
            opacity: 0,
            x: dir >= 0 ? -40 : 40,
            transition: { duration: 0.2 },
        }),
    };

    return (
        <div className="w-full flex flex-col items-center gap-6">
            <div className="w-full flex items-center gap-2 sm:gap-4">
                <div className="hidden sm:flex">
                    <ArrowButton
                        direction="back"
                        onClick={() => go(-1)}
                        label="Previous example"
                    />
                </div>

                {/* min-w-0 şart: flex öğelerinin varsayılan en küçük genişliği
                    `auto`, yani içerik (uzun konu etiketi, geniş formül) kutuyu
                    kabın dışına itiyor. Mobilde kart ekrandan taşmasının sebebi
                    buydu. */}
                <div className="flex-1 min-w-0 min-h-[300px] sm:min-h-[260px]">
                    <AnimatePresence mode="wait" custom={direction}>
                        <motion.div
                            key={index}
                            custom={direction}
                            variants={variants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            className="w-full rounded-2xl border px-5 py-7 sm:px-10 sm:py-9"
                            style={{
                                borderColor: `color-mix(in srgb, ${accent} 25%, transparent)`,
                                borderTopWidth: 3,
                                borderTopColor: accent,
                                backgroundColor: "var(--bg-elevated)",
                                boxShadow: "var(--shadow-lg)",
                            }}
                        >
                            <div className="flex items-center gap-3 mb-5 min-w-0">
                                <span
                                    className="flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold flex-shrink-0"
                                    style={{
                                        backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)`,
                                        color: accent,
                                        fontFamily: "var(--font-display)",
                                    }}
                                >
                                    {index + 1}
                                </span>
                                <span
                                    className="text-[13px] truncate"
                                    style={{
                                        color: "var(--fg-faint)",
                                        fontFamily: "var(--font-heading)",
                                    }}
                                >
                                    {question.topic} · {question.difficulty} ·{" "}
                                    {question.course}
                                </span>
                            </div>

                            <MathMarkdown className="text-base sm:text-lg">
                                {question.prompt}
                            </MathMarkdown>
                        </motion.div>
                    </AnimatePresence>
                </div>

                <div className="hidden sm:flex">
                    <ArrowButton
                        direction="forward"
                        onClick={() => go(1)}
                        label="Next example"
                    />
                </div>
            </div>

            {/* Mobil gezinme: oklar kartın altında, ortada. */}
            <div className="flex sm:hidden items-center justify-center gap-8">
                <ArrowButton
                    direction="back"
                    onClick={() => go(-1)}
                    label="Previous example"
                />
                <ArrowButton
                    direction="forward"
                    onClick={() => go(1)}
                    label="Next example"
                />
            </div>

            {/* Konum göstergesi: kaç örnek olduğunu ve nerede olduğunu söylüyor. */}
            <div className="flex items-center gap-2">
                {SAMPLE_QUESTIONS.map((item, i) => (
                    <button
                        key={item.topic}
                        onClick={() => {
                            setDirection(i > index ? 1 : -1);
                            setIndex(i);
                        }}
                        aria-label={`Example ${i + 1}`}
                        className="h-1.5 rounded-full transition-all duration-300"
                        style={{
                            width: i === index ? 20 : 6,
                            backgroundColor:
                                i === index ? accentFor(i) : "var(--border)",
                        }}
                    />
                ))}
            </div>

            <p
                className="text-sm text-center max-w-lg"
                style={{
                    color: "var(--fg-muted)",
                    fontFamily: "var(--font-geist-sans)",
                }}
            >
                {question.note}
            </p>
        </div>
    );
}