"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";

export interface ScrollStepItem {
    step: string;
    title: string;
    description: string;
    icon: ReactNode;
    /**
     * Sağdaki sabit panelde gösterilecek sahne. Verilmezse ikon + adım
     * numarası gösteriliyor (eski davranış).
     */
    visual?: ReactNode;
    /**
     * Adımın kendi vurgu rengi (hex olmalı — rozet zeminini `${color}22` ile
     * türetiyoruz). Verilmezse temanın --accent'i kullanılır.
     */
    color?: string;
}

interface ScrollStepsProps {
    items: ScrollStepItem[];
    /** Başlık rengi. Verilmezse temanın ana metin rengi. */
    color?: string;
    fontFamily?: string;
}

const StepBlock = ({
    item,
    index,
    active,
    onActive,
    color,
    fontFamily,
}: {
    item: ScrollStepItem;
    index: number;
    active: boolean;
    onActive: (i: number) => void;
    color: string;
    fontFamily: string;
}) => {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { margin: "-45% 0px -45% 0px" });

    const accent = item.color ?? "var(--accent)";
    const tint = item.color ? `${item.color}22` : "var(--accent-soft)";

    useEffect(() => {
        if (inView) onActive(index);
    }, [inView, index, onActive]);

    return (
        <div
            ref={ref}
            className="min-h-[70vh] md:min-h-[65vh] flex flex-col justify-center gap-5 md:gap-4 max-w-md py-8 md:py-0"
        >
            {/* Adım numarası en üstte: kart ve metin onun altında duruyor,
                böylece sahne "ayrı bir şeymiş" gibi görünmüyor.
                Masaüstünde de aynı sıra geçerli, orada sahne sağdaki panelde. */}
            <div className="flex items-center gap-3">
                <span
                    className="h-px w-8"
                    style={{
                        backgroundColor: active ? accent : "var(--border)",
                        transition: "background-color 0.3s ease",
                    }}
                />
                <span
                    className="text-xs tracking-[0.25em]"
                    style={{
                        color: active ? accent : "var(--fg-faint)",
                        fontFamily,
                        transition: "color 0.3s ease",
                    }}
                >
                    {item.step}
                </span>
            </div>

            {/* Mobilde sağdaki sabit panel yok; sahneyi başlığın üstünde
                gösteriyoruz. Eskiden burada yalnızca küçük bir ikon vardı ve
                adımın ne anlattığı görsel olarak kayboluyordu. */}
            {item.visual ? (
                <motion.div
                    className="md:hidden w-full rounded-2xl border overflow-hidden"
                    style={{
                        borderColor: item.color
                            ? `${item.color}44`
                            : "var(--border)",
                        backgroundColor: item.color
                            ? `${item.color}0D`
                            : "var(--surface)",
                        transition:
                            "border-color 0.4s ease, background-color 0.4s ease",
                    }}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                >
                    <div className="flex items-center justify-center h-52 p-4">
                        {item.visual}
                    </div>
                </motion.div>
            ) : (
                <motion.div
                    className="md:hidden flex items-center justify-center w-14 h-14 rounded-full"
                    style={{
                        backgroundColor: active ? tint : "var(--surface)",
                        transition: "background-color 0.4s ease",
                    }}
                    animate={{ scale: active ? 1.05 : 1 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                >
                    {item.icon}
                </motion.div>
            )}

            <h3
                className="text-2xl sm:text-3xl transition-opacity duration-300"
                style={{
                    color,
                    // Adım başlıkları büyük: Raventhorn burada okunuyor.
                    fontFamily: "var(--font-heading)",
                    fontWeight: 400,
                    opacity: active ? 1 : 0.35,
                }}
            >
                {item.title}
            </h3>
            <p
                className="text-sm leading-relaxed transition-opacity duration-300"
                style={{
                    color: "var(--fg-muted)",
                    fontFamily: "var(--font-geist-sans)",
                    opacity: active ? 1 : 0.35,
                }}
            >
                {item.description}
            </p>
        </div>
    );
};

export default function ScrollSteps({
    items,
    color = "var(--fg)",
    fontFamily = "var(--font-display)",
}: ScrollStepsProps) {
    const [active, setActive] = useState(0);

    const current = items[active];
    const currentAccent = current.color ?? "var(--accent)";
    const currentTint = current.color ? `${current.color}22` : "var(--accent-soft)";

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 w-full items-start">
            <div className="flex flex-col">
                {items.map((item, i) => (
                    <StepBlock
                        key={item.step}
                        item={item}
                        index={i}
                        active={active === i}
                        onActive={setActive}
                        color={color}
                        fontFamily={fontFamily}
                    />
                ))}
            </div>

            <div className="hidden md:block sticky top-28 h-[65vh]">
                <div
                    className="relative w-full h-full rounded-3xl border overflow-hidden flex items-center justify-center"
                    style={{
                        // Panel de aktif adımın rengini alıyor — hangi adımda olduğun
                        // sağ tarafta da okunuyor, sadece ikon değişmiyor.
                        borderColor: current.color ? `${current.color}55` : "var(--border)",
                        backgroundColor: current.color ? `${current.color}0D` : "var(--surface)",
                        transition: "border-color 0.5s ease, background-color 0.5s ease",
                    }}
                >
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={active}
                            initial={{ opacity: 0, scale: 0.94 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.94 }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                            className="flex h-full w-full flex-col items-center justify-center gap-4 p-8"
                        >
                            {current.visual ? (
                                <>
                                    {current.visual}
                                    {/* Adım numarası artık köşede küçük bir işaret:
                                        sahne ana içerik, numara yalnızca konum bilgisi. */}
                                    <span
                                        className="text-xs tracking-[0.3em]"
                                        style={{
                                            color: currentAccent,
                                            fontFamily,
                                            opacity: 0.6,
                                        }}
                                    >
                                        {current.step}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <div
                                        className="flex items-center justify-center w-20 h-20 rounded-full"
                                        style={{ backgroundColor: currentTint }}
                                    >
                                        {current.icon}
                                    </div>
                                    <span
                                        className="text-6xl select-none"
                                        style={{
                                            color: currentAccent,
                                            fontFamily,
                                            opacity: 0.3,
                                            fontWeight: 700,
                                        }}
                                    >
                                        {current.step}
                                    </span>
                                </>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}