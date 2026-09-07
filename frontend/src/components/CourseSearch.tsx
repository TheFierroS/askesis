"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

import type { PublicCourse } from "../lib/publicApi";

export interface CourseGroup {
    course: string;
    entries: PublicCourse[];
}

/**
 * Ders dizini: arama kutusu ve liste.
 *
 * İstemci bileşeni, çünkü arama kutusu durum tutuyor. Ama LİSTENİN TAMAMI
 * ilk HTML'e basılıyor: sunucu tarafında arama kutusu boş, dolayısıyla filtre
 * hiçbir şeyi elemiyor ve bütün dersler çıktıya giriyor. Filtreleme ancak
 * kullanıcı yazmaya başlayınca, tarayıcıda devreye giriyor.
 *
 * Bu ayrım önemli: liste sunucuda değil de yalnızca tarayıcıda oluşsaydı
 * arama motoru boş bir sayfa görürdü ve ders sayfalarına giden bağlantıları
 * hiç keşfedemezdi.
 */
export default function CourseSearch({ groups }: { groups: CourseGroup[] }) {
    const [query, setQuery] = useState("");

    const filtered = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (!term) return groups;

        // Ders adı ve sınav türü üzerinden arama: kullanıcı "linear" da
        // yazabilir "final" da.
        return groups.filter(
            (group) =>
                group.course.toLowerCase().includes(term) ||
                group.entries.some((entry) =>
                    entry.exam_type.toLowerCase().includes(term),
                ),
        );
    }, [groups, query]);

    return (
        <div className="flex flex-col gap-6">
            {/* Tek ders varken arama kutusu gereksiz gürültü. */}
            {groups.length > 3 && (
                <motion.input
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.28, ease: "easeOut" }}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search a course…"
                    aria-label="Search courses"
                    className="w-full rounded-full border px-5 py-3 text-sm outline-none transition-colors focus:border-[var(--accent)]"
                    style={{
                        borderColor: "var(--border)",
                        backgroundColor: "var(--surface)",
                        color: "var(--fg)",
                        fontFamily: "var(--font-geist-sans)",
                    }}
                />
            )}

            {filtered.length === 0 ? (
                <p
                    className="text-sm py-4"
                    style={{
                        color: "var(--fg-faint)",
                        fontFamily: "var(--font-geist-sans)",
                    }}
                >
                    No course matches “{query}”.
                </p>
            ) : (
                <ul className="flex flex-col gap-3">
                    {filtered.map((group, index) => (
                        <motion.li
                            key={group.course}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            /* Sırayla beliriyor: hepsi aynı anda çıkınca liste
                               tek blok gibi görünüyordu. Gecikme üst sınırlı,
                               yüz ders olduğunda sonuncusu dakikalarca
                               beklemesin. */
                            transition={{
                                duration: 0.45,
                                delay: 0.3 + Math.min(index, 8) * 0.06,
                                ease: "easeOut",
                            }}
                            className="rounded-2xl border px-5 py-5 sm:px-6 flex flex-col gap-3"
                            style={{
                                borderColor: "var(--border)",
                                backgroundColor: "var(--bg-elevated)",
                            }}
                        >
                            <h2
                                className="text-lg"
                                style={{
                                    fontFamily: "var(--font-heading)",
                                    fontWeight: 400,
                                }}
                            >
                                {group.course}
                            </h2>

                            {/* Her sınav türü kendi sayfasına gidiyor. Kartın
                                tamamını bağlantı yapamıyoruz: bir kartta birden
                                fazla hedef var. */}
                            <div className="flex flex-wrap items-center gap-2">
                                {group.entries.map((entry) => (
                                    <Link
                                        key={entry.slug}
                                        href={`/courses/${entry.slug}`}
                                        className="flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm transition-colors hover:border-[var(--border-hover)]"
                                        style={{
                                            borderColor: "var(--border)",
                                            color: "var(--fg)",
                                            fontFamily: "var(--font-display)",
                                        }}
                                    >
                                        <span>{entry.exam_type}</span>
                                        <span style={{ color: "var(--fg-faint)" }}>
                                            {entry.question_count} questions
                                        </span>
                                        <span
                                            style={{ color: "var(--accent)" }}
                                            aria-hidden="true"
                                        >
                                            <svg
                                                width="16"
                                                height="16"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="1.8"
                                            >
                                                <path
                                                    d="M9 6l6 6-6 6"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                />
                                            </svg>
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        </motion.li>
                    ))}
                </ul>
            )}
        </div>
    );
}