"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

/**
 * Beliriş animasyonu sarmalayıcısı.
 *
 * Ders sayfaları sunucu bileşeni — içerik ilk HTML'de olsun, arama motoru
 * JavaScript çalıştırmadan görsün diye. Ama framer-motion istemci tarafı
 * gerektiriyor. Bu küçük sarmalayıcı ikisini uzlaştırıyor: içerik sunucuda
 * basılıyor, animasyon tarayıcıda çalışıyor.
 *
 * `mode` iki durum için:
 *   - "mount": sayfa açılır açılmaz oynar. Ekranın üstündeki bölümler için;
 *     onlar zaten görünür durumda ve kaydırma beklemenin anlamı yok.
 *   - "scroll": bölüm ekrana girince oynar. Aşağıdaki bölümler için.
 *
 * Ana sayfada aynı desen doğrudan motion.div ile yazılmış; burada tekrar
 * etmemek için tek yere topladık.
 */
export default function Reveal({
    children,
    mode = "scroll",
    delay = 0,
    y = 12,
    className = "",
}: {
    children: ReactNode;
    mode?: "mount" | "scroll";
    delay?: number;
    y?: number;
    className?: string;
}) {
    const hidden = { opacity: 0, y };
    const shown = { opacity: 1, y: 0 };
    const transition = { duration: 0.5, ease: "easeOut" as const, delay };

    if (mode === "mount") {
        return (
            <motion.div
                initial={hidden}
                animate={shown}
                transition={transition}
                className={className}
            >
                {children}
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={hidden}
            whileInView={shown}
            viewport={{ once: true, margin: "-60px" }}
            transition={transition}
            className={className}
        >
            {children}
        </motion.div>
    );
}