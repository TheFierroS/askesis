"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface SelectFieldProps {
    label: string;
    value: string;
    options: string[];
    onChange: (value: string) => void;
    /**
     * @deprecated Renk artık temadan (var(--fg)) geliyor.
     * Prop, eski çağrılar kırılmasın diye duruyor; yeni yerlerde kullanma.
     */
    honey?: string;
    fontFamily?: string;
    /** Bu alanın vurgu rengi. Verilmezse temanın --accent'i. */
    accent?: string;
    /**
     * Henüz içeriği hazır olmayan seçenekler. Listeden çıkarmıyoruz — kullanıcı
     * programın tamamını görebilmeli — ama soluk çizip yanlarına bir işaret
     * koyuyoruz ki neyin hazır olduğu belli olsun.
     */
    unavailable?: string[];
    /** Soluk seçeneklerin yanında görünen kısa not. */
    unavailableLabel?: string;
}

export default function SelectField({
    label,
    value,
    options,
    onChange,
    honey,
    fontFamily = "var(--font-display)",
    accent = "var(--accent)",
    unavailable = [],
    unavailableLabel = "no exams yet",
}: SelectFieldProps) {
    const missing = new Set(unavailable);
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const fg = honey ?? "var(--fg)";

    // Listener'ları sadece menü açıkken bağla (eskiden sürekli açıktı).
    useEffect(() => {
        if (!open) return;
        const onClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onClickOutside);
        document.addEventListener("keydown", onEsc);
        return () => {
            document.removeEventListener("mousedown", onClickOutside);
            document.removeEventListener("keydown", onEsc);
        };
    }, [open]);

    return (
        <div ref={ref} className="relative w-full">
            <span
                className="block text-[10px] uppercase tracking-[0.2em] mb-1.5"
                style={{ color: accent, fontFamily }}
            >
                {label}
            </span>

            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={open}
                className="w-full flex items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-sm text-left transition-colors hover:border-[var(--border-hover)]"
                style={{
                    // Açıkken kenarlık vurgu rengine dönsün — hangi alanın açık
                    // olduğu dört select yan yanayken belli olmuyordu.
                    borderColor: open ? accent : "var(--border)",
                    backgroundColor: "var(--surface)",
                    color: fg,
                    fontFamily,
                }}
            >
                <span className="truncate">{value || "—"}</span>
                <motion.span
                    animate={{ rotate: open ? 180 : 0 }}
                    transition={{ duration: 0.25 }}
                    className="text-xs flex-shrink-0"
                    style={{ color: "var(--fg-muted)" }}
                >
                    ▾
                </motion.span>
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        role="listbox"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2 }}
                        className="absolute z-20 mt-2 w-full max-h-56 overflow-y-auto rounded-xl border backdrop-blur-md"
                        style={{
                            borderColor: "var(--border)",
                            // Light temada "#290f28ee" siyah bir kutu bırakıyordu;
                            // artık yükseltilmiş zemin + gölge kullanıyoruz.
                            backgroundColor: "var(--bg-elevated)",
                            boxShadow: "var(--shadow-lg)",
                        }}
                    >
                        {options.map((opt) => {
                            const selected = opt === value;
                            const isMissing = missing.has(opt);
                            return (
                                <button
                                    key={opt}
                                    type="button"
                                    role="option"
                                    aria-selected={selected}
                                    onClick={() => {
                                        onChange(opt);
                                        setOpen(false);
                                    }}
                                    className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition-colors hover:bg-[var(--surface-hover)]"
                                    style={{
                                        color: selected ? accent : "var(--fg-muted)",
                                        opacity: isMissing ? 0.45 : 1,
                                        backgroundColor: "transparent",
                                        borderLeft: `2px solid ${selected ? accent : "transparent"}`,
                                        fontFamily,
                                    }}
                                >
                                    <span className="truncate">{opt}</span>
                                    {isMissing && (
                                        <span
                                            className="flex-shrink-0 text-[10px] tracking-wide"
                                            style={{ color: "var(--fg-faint)" }}
                                        >
                                            {unavailableLabel}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}