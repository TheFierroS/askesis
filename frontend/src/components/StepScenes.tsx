"use client";

import { motion } from "framer-motion";

/**
 * "Nasıl çalışır" adımlarının görselleri.
 *
 * Neden ikon değil?
 * Hazır ikon setleri (belge, yıldız, onay işareti) her sitede aynı ve hiçbir
 * şey anlatmıyor — yalnızca konuyu işaret ediyorlar. Buradaki sahneler adımın
 * kendisini gösteriyor: sayfanın sorulara ayrılması, konu sıklığının
 * ölçülmesi, matrisin farklı sayılarla yeniden yazılması, elenen soru.
 *
 * Hepsi tema değişkenleriyle çiziliyor, adımın kendi vurgu rengini alıyor.
 * Animasyon yalnızca görünürken bir kez oynuyor; döngüsel hareket dikkat
 * dağıtıyor ve okuma sırasında rahatsız ediyor.
 */

const VIEW = 320;

/** Sahnelerin ortak giriş animasyonu: aşağıdan hafifçe belirme. */
const enter = (delay = 0) => ({
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] as const },
});

function Frame({ children }: { children: React.ReactNode }) {
    return (
        <svg
            viewBox={`0 0 ${VIEW} ${VIEW}`}
            className="w-full h-full max-w-[280px] max-h-[280px]"
            fill="none"
            aria-hidden="true"
        >
            {children}
        </svg>
    );
}

/** Metin satırı yerine geçen çizgiler — okunacak bir şey yok, doku var. */
function TextLines({
    x,
    y,
    width,
    count,
    gap = 9,
    color,
    opacity = 0.35,
}: {
    x: number;
    y: number;
    width: number;
    count: number;
    gap?: number;
    color: string;
    opacity?: number;
}) {
    return (
        <>
            {Array.from({ length: count }, (_, i) => (
                <rect
                    key={i}
                    x={x}
                    y={y + i * gap}
                    // Son satır kısa: gerçek paragraf öyle biter.
                    width={i === count - 1 ? width * 0.62 : width}
                    height={3}
                    rx={1.5}
                    fill={color}
                    opacity={opacity}
                />
            ))}
        </>
    );
}

/** 01 — Sınav sayfası tek tek sorulara ayrılıyor. */
export function SceneSplit({ color }: { color: string }) {
    return (
        <Frame>
            {/* kaynak sayfa */}
            <motion.g {...enter(0)}>
                <rect
                    x={28}
                    y={54}
                    width={104}
                    height={140}
                    rx={8}
                    fill="var(--surface)"
                    stroke="var(--border)"
                />
                <rect x={42} y={70} width={44} height={5} rx={2.5} fill={color} />
                <TextLines x={42} y={88} width={76} count={4} color="var(--fg)" />
                <TextLines x={42} y={132} width={76} count={4} color="var(--fg)" />
            </motion.g>

            {/* ayrılan sorular */}
            {[0, 1, 2].map((index) => (
                <motion.g
                    key={index}
                    {...enter(0.15 + index * 0.12)}
                >
                    <rect
                        x={186}
                        y={48 + index * 52}
                        width={104}
                        height={42}
                        rx={7}
                        fill="var(--bg-elevated)"
                        stroke={color}
                        strokeOpacity={0.45}
                    />
                    <circle cx={200} cy={62 + index * 52} r={6} fill={color} opacity={0.25} />
                    <TextLines
                        x={214}
                        y={59 + index * 52}
                        width={62}
                        count={2}
                        gap={8}
                        color="var(--fg)"
                    />
                </motion.g>
            ))}

            {/* ayrışma çizgileri */}
            {[0, 1, 2].map((index) => (
                <motion.path
                    key={index}
                    d={`M136 ${112} C 160 ${112}, 160 ${69 + index * 52}, 182 ${69 + index * 52}`}
                    stroke={color}
                    strokeOpacity={0.4}
                    strokeWidth={1.5}
                    strokeDasharray="3 4"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.6, delay: 0.25 + index * 0.1 }}
                />
            ))}
        </Frame>
    );
}

/** 02 — Konu sıklığı: her yıl çıkan konu daha ağır basıyor. */
export function SceneFrequency({ color }: { color: string }) {
    // Yükseklikler konu sıklığını temsil ediyor: ilk konu her yıl çıkmış.
    const bars = [
        { label: 4, height: 118 },
        { label: 3, height: 92 },
        { label: 3, height: 88 },
        { label: 2, height: 62 },
        { label: 1, height: 34 },
    ];

    return (
        <Frame>
            {/* taban çizgisi */}
            <motion.line
                x1={38}
                y1={222}
                x2={282}
                y2={222}
                stroke="var(--border)"
                strokeWidth={1.5}
                {...enter(0)}
            />

            {bars.map((bar, index) => {
                const x = 46 + index * 47;
                return (
                    <g key={index}>
                        <motion.rect
                            x={x}
                            width={30}
                            rx={5}
                            fill={color}
                            // İlk iki sütun tam renkte: sık çıkan konular öne çıksın.
                            opacity={index < 2 ? 0.85 : 0.3}
                            initial={{ height: 0, y: 222 }}
                            animate={{ height: bar.height, y: 222 - bar.height }}
                            transition={{
                                duration: 0.55,
                                delay: 0.1 + index * 0.08,
                                ease: [0.16, 1, 0.3, 1],
                            }}
                        />
                        {/* sütunun üstünde sıklık sayısı */}
                        <motion.circle
                            cx={x + 15}
                            cy={222 - bar.height - 14}
                            r={9}
                            fill="var(--bg-elevated)"
                            stroke={color}
                            strokeOpacity={index < 2 ? 0.6 : 0.25}
                            {...enter(0.35 + index * 0.08)}
                        />
                        <motion.text
                            x={x + 15}
                            y={222 - bar.height - 10}
                            textAnchor="middle"
                            fontSize={10}
                            fill={color}
                            opacity={index < 2 ? 0.9 : 0.45}
                            style={{ fontFamily: "var(--font-display)" }}
                            {...enter(0.35 + index * 0.08)}
                        >
                            {bar.label}
                        </motion.text>
                    </g>
                );
            })}

            <motion.text
                x={160}
                y={252}
                textAnchor="middle"
                fontSize={11}
                fill="var(--fg-faint)"
                style={{ fontFamily: "var(--font-display)" }}
                {...enter(0.7)}
            >
                times each topic appeared
            </motion.text>
        </Frame>
    );
}

/** 03 — Aynı yapı, farklı sayılar. */
export function SceneRewrite({ color }: { color: string }) {
    const source = [
        [3, 5],
        [-2, 7],
    ];
    const rewritten = [
        [2, -1],
        [5, 0],
    ];

    const bracket = (x: number, flip = false) => {
        const direction = flip ? -1 : 1;
        return `M${x} 96 h${8 * direction} v72 h${-8 * direction}`;
    };

    const matrix = (
        originX: number,
        values: number[][],
        highlight: boolean,
        delay: number,
    ) => (
        <motion.g {...enter(delay)}>
            <path
                d={bracket(originX)}
                stroke={highlight ? color : "var(--fg-muted)"}
                strokeWidth={2}
                strokeLinecap="round"
            />
            <path
                d={bracket(originX + 72, true)}
                stroke={highlight ? color : "var(--fg-muted)"}
                strokeWidth={2}
                strokeLinecap="round"
            />
            {values.map((row, rowIndex) =>
                row.map((value, colIndex) => (
                    <text
                        key={`${rowIndex}-${colIndex}`}
                        x={originX + 22 + colIndex * 34}
                        y={124 + rowIndex * 32}
                        textAnchor="middle"
                        fontSize={17}
                        fill={highlight ? color : "var(--fg)"}
                        opacity={highlight ? 1 : 0.65}
                        style={{ fontFamily: "var(--font-display)" }}
                    >
                        {value}
                    </text>
                )),
            )}
        </motion.g>
    );

    return (
        <Frame>
            {matrix(24, source, false, 0)}

            {/* dönüşüm oku */}
            <motion.g {...enter(0.25)}>
                <path
                    d="M132 132 h44"
                    stroke={color}
                    strokeWidth={2}
                    strokeLinecap="round"
                />
                <path
                    d="M170 126 l8 6 l-8 6"
                    stroke={color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                />
                <text
                    x={154}
                    y={116}
                    textAnchor="middle"
                    fontSize={10}
                    fill="var(--fg-faint)"
                    style={{ fontFamily: "var(--font-display)" }}
                >
                    same idea
                </text>
            </motion.g>

            {matrix(190, rewritten, true, 0.4)}

            <motion.text
                x={160}
                y={208}
                textAnchor="middle"
                fontSize={11}
                fill="var(--fg-faint)"
                style={{ fontFamily: "var(--font-display)" }}
                {...enter(0.6)}
            >
                new numbers, same difficulty
            </motion.text>
        </Frame>
    );
}

/** 04 — Denetim: geçen soru ve elenen soru. */
export function SceneReview({ color }: { color: string }) {
    return (
        <Frame>
            {/* onaylanan */}
            <motion.g {...enter(0.1)}>
                <rect
                    x={54}
                    y={62}
                    width={212}
                    height={64}
                    rx={9}
                    fill="var(--bg-elevated)"
                    stroke="var(--accent-3)"
                    strokeOpacity={0.55}
                />
                <TextLines x={74} y={80} width={132} count={3} color="var(--fg)" opacity={0.5} />
                <circle cx={238} cy={94} r={13} fill="var(--accent-3)" opacity={0.16} />
                <motion.path
                    d="M232 94 l4 4 l8 -9"
                    stroke="var(--accent-3)"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.35, delay: 0.5 }}
                />
            </motion.g>

            {/* elenen — soluk ve hafif eğik, "kenara atılmış" */}
            <motion.g
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 0.45, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                style={{ transformOrigin: "160px 190px" }}
                transform="rotate(-3 160 190)"
            >
                <rect
                    x={54}
                    y={158}
                    width={212}
                    height={64}
                    rx={9}
                    fill="transparent"
                    stroke="var(--danger)"
                    strokeOpacity={0.5}
                    strokeDasharray="5 4"
                />
                <TextLines
                    x={74}
                    y={176}
                    width={132}
                    count={3}
                    color="var(--fg)"
                    opacity={0.28}
                />
                <circle cx={238} cy={190} r={13} fill="var(--danger)" opacity={0.12} />
                <path
                    d="M233 185 l10 10 M243 185 l-10 10"
                    stroke="var(--danger)"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                />
            </motion.g>

            <motion.text
                x={160}
                y={252}
                textAnchor="middle"
                fontSize={11}
                fill={color}
                opacity={0.75}
                style={{ fontFamily: "var(--font-display)" }}
                {...enter(0.7)}
            >
                doubtful questions never reach you
            </motion.text>
        </Frame>
    );
}