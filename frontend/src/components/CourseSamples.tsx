"use client";

import { useState } from "react";

import ArrowButton from "./ArrowButton";
import MathMarkdown from "./MathMarkdown";
import type { PublicSample } from "../lib/publicApi";
import { titleCase } from "../lib/publicApi";

/**
 * Ders sayfasındaki örnek soru gezgini.
 *
 * BEŞ SORUNUN DA DOM'DA OLMASI ŞART. Alışıldık kaydırmalı kart yalnızca aktif
 * slaytı basar; burada öyle yapsak arama motoru beş sorudan yalnızca birini
 * görürdü ve sayfanın içerik değerinin çoğu kaybolurdu.
 *
 * Çözüm: hepsi aynı grid hücresine yığılıyor, aktif olmayanlar opaklıkla
 * gizleniyor. Yükseklik en uzun soruya göre sabitleniyor — gezinirken kart
 * zıplamıyor, ki tek slayt basan sürümün ayrı bir derdi buydu.
 */
export default function CourseSamples({ samples }: { samples: PublicSample[] }) {
    const [index, setIndex] = useState(0);

    if (samples.length === 0) return null;

    const isFirst = index === 0;
    const isLast = index === samples.length - 1;

    return (
        <div className="w-full flex flex-col items-center gap-6">
            <div className="w-full flex items-center justify-center gap-2 sm:gap-4">
                <div className="hidden sm:flex">
                    <ArrowButton
                        direction="back"
                        onClick={() => setIndex((i) => Math.max(0, i - 1))}
                        disabled={isFirst}
                        label="Previous question"
                    />
                </div>

                {/* grid + her slayta grid-area: 1/1 → hepsi üst üste,
                    yükseklik en uzun olana göre. */}
                <div className="flex-1 min-w-0 grid w-full">
                    {samples.map((sample, i) => (
                        <article
                            key={sample.id}
                            aria-hidden={i !== index}
                            className="rounded-2xl border px-5 py-7 sm:px-9 transition-opacity duration-300"
                            style={{
                                gridArea: "1 / 1",
                                borderColor: "var(--border)",
                                borderTopWidth: "3px",
                                borderTopColor: "var(--accent)",
                                backgroundColor: "var(--bg-elevated)",
                                boxShadow: "var(--shadow-lg)",
                                opacity: i === index ? 1 : 0,
                                pointerEvents: i === index ? "auto" : "none",
                            }}
                        >
                            <div className="flex items-center gap-3 mb-5 min-w-0">
                                <span
                                    className="flex items-center justify-center w-8 h-8 rounded-full text-xs flex-shrink-0"
                                    style={{
                                        backgroundColor:
                                            "color-mix(in srgb, var(--accent) 14%, transparent)",
                                        color: "var(--accent)",
                                        fontFamily: "var(--font-display)",
                                    }}
                                >
                                    {i + 1}
                                </span>
                                <span
                                    className="text-[13px] truncate"
                                    style={{
                                        color: "var(--fg-faint)",
                                        fontFamily: "var(--font-heading)",
                                    }}
                                >
                                    {titleCase(sample.topic)} · {sample.difficulty}
                                </span>
                            </div>

                            <MathMarkdown className="text-base sm:text-lg">
                                {sample.prompt}
                            </MathMarkdown>
                        </article>
                    ))}
                </div>

                <div className="hidden sm:flex">
                    <ArrowButton
                        direction="forward"
                        onClick={() => setIndex((i) => Math.min(samples.length - 1, i + 1))}
                        disabled={isLast}
                        label="Next question"
                    />
                </div>
            </div>

            <div className="flex sm:hidden items-center justify-center gap-8">
                <ArrowButton
                    direction="back"
                    onClick={() => setIndex((i) => Math.max(0, i - 1))}
                    disabled={isFirst}
                    label="Previous question"
                />
                <ArrowButton
                    direction="forward"
                    onClick={() => setIndex((i) => Math.min(samples.length - 1, i + 1))}
                    disabled={isLast}
                    label="Next question"
                />
            </div>

            <div className="flex items-center gap-2">
                {samples.map((sample, i) => (
                    <button
                        key={sample.id}
                        onClick={() => setIndex(i)}
                        aria-label={`Question ${i + 1}`}
                        className="h-1.5 rounded-full transition-all duration-300"
                        style={{
                            width: i === index ? "20px" : "6px",
                            backgroundColor: i === index ? "var(--accent)" : "var(--border)",
                        }}
                    />
                ))}
            </div>
        </div>
    );
}