"use client";

/**
 * Dönen kelimeli loader (uiverse: kennyotsu/fresh-lizard-20).
 *
 * Kutu/kart yok: sayfanın ortasında serbest duruyor. Kutulu hali içerik
 * kartlarıyla karışıyor ve "bir şeyin içinde" hissi veriyordu.
 *
 * Animasyon tam olarak 5 kelimeye göre yazılmış (translateY -400%'e kadar
 * gidiyor), o yüzden liste 5 elemanlı olmalı ve son kelime ilkiyle aynı
 * olmalı — döngü böyle kesintisiz görünüyor.
 */

const DEFAULT_WORDS = [
    "past exams",
    "patterns",
    "questions",
    "solutions",
    "past exams",
];

export default function GenerationLoader({
    label = "reading",
    words = DEFAULT_WORDS,
    /** Yükseltilmiş zemin üzerinde kullanılıyorsa maskeyi ona uydurur. */
    elevated = false,
    className = "",
}: {
    label?: string;
    words?: string[];
    elevated?: boolean;
    className?: string;
}) {
    return (
        <div
            className={`flex justify-center ${className}`}
            role="status"
            aria-live="polite"
        >
            <span className="sr-only">Working…</span>
            <div
                className={`gen-loader ${elevated ? "gen-loader--elevated" : ""}`}
                aria-hidden="true"
            >
                <p style={{ lineHeight: "48px" }}>{label}</p>
                <div className="gen-loader__words">
                    {words.map((word, index) => (
                        <span className="gen-loader__word" key={`${word}-${index}`}>
                            {word}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}