"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Bildirim (toast) sistemi.
 *
 * Neden satır içi hata mesajı değil?
 * Sayfanın bir köşesinde beliren küçük kırmızı yazı gözden kaçıyor ve aynı
 * hata tekrarlandığında hiçbir şey değişmediği için kullanıcı butonun
 * çalışmadığını sanıyor. Sağdan kayarak giren bir kart hem fark ediliyor hem
 * de her denemede yeniden beliriyor: "yine olmadı" mesajı görsel olarak
 * veriliyor.
 *
 * Kendi kendine kapanıyor ama elle de kapatılabiliyor — kullanıcıyı okumaya
 * zorlamıyoruz, dikkatini de sürekli meşgul etmiyoruz.
 */

export type ToastKind = "error" | "success" | "info";

export interface Toast {
    id: number;
    message: string;
    kind: ToastKind;
}

const AUTO_DISMISS_MS = 6000;

export function useToasts() {
    const [toasts, setToasts] = useState<Toast[]>([]);
    // Artan sayaç: aynı mesaj arka arkaya gelse bile React'in ayırt edebilmesi
    // için her bildirimin benzersiz anahtarı olmalı.
    const nextId = useRef(0);

    const dismiss = useCallback((id: number) => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
    }, []);

    const push = useCallback(
        (message: string, kind: ToastKind = "error") => {
            const id = nextId.current++;
            setToasts((current) => [...current, { id, message, kind }]);
            window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
        },
        [dismiss],
    );

    return { toasts, push, dismiss };
}

const KIND_COLOR: Record<ToastKind, string> = {
    error: "var(--danger)",
    success: "var(--accent-3)",
    info: "var(--accent)",
};

function Icon({ kind }: { kind: ToastKind }) {
    if (kind === "success") {
        return (
            <path
                d="M5 12l4 4 10-10"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        );
    }
    if (kind === "info") {
        return (
            <path
                d="M12 8h.01M11 12h1v5h1"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        );
    }
    return (
        <path
            d="M12 7v6M12 17h.01"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            fill="none"
        />
    );
}

export function ToastStack({
    toasts,
    onDismiss,
}: {
    toasts: Toast[];
    onDismiss: (id: number) => void;
}) {
    return (
        <div
            className="print:hidden fixed top-4 right-4 z-[60] flex flex-col gap-2 w-[min(22rem,calc(100vw-2rem))]"
            role="status"
            aria-live="polite"
        >
            <AnimatePresence initial={false}>
                {toasts.map((toast) => {
                    const accent = KIND_COLOR[toast.kind];
                    return (
                        <motion.div
                            key={toast.id}
                            layout
                            // Sağdan giriyor, sağdan çıkıyor: geldiği yön
                            // gittiği yönle aynı olunca hareket doğal duruyor.
                            initial={{ opacity: 0, x: 320 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 320 }}
                            transition={{
                                type: "spring",
                                stiffness: 320,
                                damping: 30,
                            }}
                            className="flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg"
                            style={{
                                borderColor: `color-mix(in srgb, ${accent} 45%, transparent)`,
                                borderLeftWidth: 3,
                                borderLeftColor: accent,
                                backgroundColor: "var(--bg-elevated)",
                                boxShadow: "var(--shadow-lg)",
                            }}
                        >
                            <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                className="flex-shrink-0 mt-0.5"
                                style={{ color: accent }}
                                aria-hidden="true"
                            >
                                <Icon kind={toast.kind} />
                            </svg>

                            <p
                                className="flex-1 text-sm leading-relaxed"
                                style={{
                                    color: "var(--fg)",
                                    fontFamily: "var(--font-geist-sans)",
                                }}
                            >
                                {toast.message}
                            </p>

                            <button
                                onClick={() => onDismiss(toast.id)}
                                aria-label="Dismiss"
                                className="flex-shrink-0 rounded-md p-0.5 transition-opacity opacity-50 hover:opacity-100"
                                style={{ color: "var(--fg-muted)" }}
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
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}