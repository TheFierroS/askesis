"use client";

import { motion } from "framer-motion";

import type { PublicTopic } from "../lib/publicApi";
import { titleCase } from "../lib/publicApi";

/**
 * Konu dağılımı çubukları.
 *
 * Çubuklar sıfır genişlikten hedefine doğru, sırayla doluyor. Sayfanın görsel
 * odağı burası: "bu dersin vizesinde en çok ne çıkıyor" sorusunun cevabı.
 * Hepsinin aynı anda belirmesi tabloyu bir liste gibi gösteriyordu; sırayla
 * dolunca ağırlık farkı gözle okunuyor.
 *
 * Metin ve sayılar animasyondan bağımsız: onlar ilk HTML'de tam haliyle
 * duruyor, yalnızca çubuğun genişliği animasyonlu. Arama motoru konu
 * adlarını ve sayıları olduğu gibi görüyor.
 */
export default function TopicBars({ topics }: { topics: PublicTopic[] }) {
    if (topics.length === 0) return null;

    // En sık çıkan konu çubuğun tam boyunu alıyor, diğerleri ona oranlanıyor.
    const busiest = topics[0]?.count ?? 1;

    return (
        <ul className="flex flex-col gap-3.5">
            {topics.map((topic, index) => {
                const width = Math.max(8, Math.round((topic.count / busiest) * 150));

                return (
                    <motion.li
                        key={topic.topic}
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true, margin: "-40px" }}
                        transition={{ duration: 0.35, delay: index * 0.05 }}
                        className="flex items-center gap-4"
                    >
                        <span
                            className="text-sm flex-1 min-w-0"
                            style={{ fontFamily: "var(--font-geist-sans)" }}
                        >
                            {titleCase(topic.topic)}
                        </span>

                        <motion.span
                            initial={{ width: 0 }}
                            whileInView={{ width }}
                            viewport={{ once: true, margin: "-40px" }}
                            transition={{
                                duration: 0.6,
                                ease: [0.16, 1, 0.3, 1],
                                delay: index * 0.05 + 0.1,
                            }}
                            className="h-1.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: "var(--accent)" }}
                        />

                        <span
                            className="text-xs w-6 text-right flex-shrink-0"
                            style={{
                                color: "var(--fg-faint)",
                                fontFamily: "var(--font-display)",
                            }}
                        >
                            {topic.count}
                        </span>
                    </motion.li>
                );
            })}
        </ul>
    );
}