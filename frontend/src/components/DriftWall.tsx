import * as React from 'react';
import { CSSProperties, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';

export interface DriftWallItem {
    image: string;
    title?: string;
    href?: string;
}

export interface DriftWallProps {
    items?: DriftWallItem[];
    columns?: number;
    tileWidth?: number;
    tileHeight?: number;
    gap?: number;
    radius?: number;
    tilt?: number;
    turn?: number;
    roll?: number;
    perspective?: number;
    depth?: number;
    speed?: number;
    direction?: 'up' | 'down';
    variance?: number;
    parallax?: number;
    pauseOnHover?: boolean;
    lift?: number;
    fade?: number;
    dim?: number;
    /** Tile üstündeki renk katmanının opaklığı (açık temada düşük tutulmalı) */
    overlayOpacity?: number;
    grayscale?: boolean;
    overlayColor?: string;
    /**
     * Duvarın yatay kaymasını düzeltir (yüzde).
     *
     * Plan 3B'de `turn` açısıyla döndürüldüğü için görsel merkez matematiksel
     * merkezle çakışmıyor: sol tarafta daha çok boşluk, sağ taraf ekran kenarına
     * yapışık duruyor. Negatif değer sola, pozitif sağa kaydırıyor.
     */
    offsetX?: number;
    className?: string;
    style?: CSSProperties;
}

interface ColumnMeta {
    copyHeight: number;
    copies: number;
}

/**
 * `items` verilmediğinde kullanılan yedek liste.
 *
 * Eskiden picsum.photos'tan rastgele stok fotoğraf çekiyordu. Dış servise
 * bağımlı olmak istemiyoruz: o servis düşerse hero boş kalıyor ve sayfa
 * açılışı üçüncü bir alan adına istek atmayı bekliyor.
 *
 * Gerçek görseller lib/showcase.ts'ten geliyor; burası yalnızca bileşen
 * items olmadan kullanılırsa devreye giriyor.
 */
const DEFAULT_ITEMS: DriftWallItem[] = Array.from({ length: 8 }, (_, i) => ({
    image: `/showcase/${i + 1}.png`,
    title: `Showcase ${i + 1}`,
    href: undefined,
}));

/** Her sütunda en az bu kadar kare olsun; azı dikeyde tekrara yol açıyor. */
const MIN_PER_COLUMN = 4;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * Görselleri sütunlara dağıtır.
 *
 * Naif dağıtım (`items[i % columns]`) 8 görseli 6 sütuna böldüğünde dört
 * sütuna TEK görsel düşürüyordu. Tek görselli sütun onu sonsuza kadar
 * tekrarlıyor: dikeyde aynı resim art arda diziliyor.
 *
 * Yöntem: sütun c'nin r. karesi `(c + r * stride) % n` indisli görsel.
 *
 * `stride` görsel sayısıyla aralarında asal seçiliyor. Bunun sonucu şu:
 * bir sütunda ardışık iki kare her zaman `stride` kadar farklı indise
 * düşüyor ve stride, n'in katı olmadığı için ikisi asla aynı görsel olamıyor.
 * Yan yana sütunlar da 1 fark ediyor, yani yatayda da tekrar yok.
 *
 * Rastgelelik YOK: sunucuda ve tarayıcıda aynı sonucu vermeli, yoksa
 * hydration uyuşmazlığı çıkıyor.
 */
function buildColumns(
    items: DriftWallItem[],
    columns: number,
): DriftWallItem[][] {
    const count = items.length;
    if (count === 0) return Array.from({ length: columns }, () => []);
    if (count === 1) {
        return Array.from({ length: columns }, () => [items[0]]);
    }

    const perColumn = Math.max(MIN_PER_COLUMN, Math.ceil(count / columns) + 1);

    // Görsel sayısıyla aralarında asal ilk adım. 1 her zaman çalışır ama
    // komşu sütunlar birbirinin kaydırılmışı olur; daha büyük bir adım
    // duvarı gözle daha karışık gösteriyor.
    const stride =
        [3, 5, 7, 2, 4, 6].find((s) => s < count && gcd(s, count) === 1) ?? 1;

    return Array.from({ length: columns }, (_, col) =>
        Array.from(
            { length: perColumn },
            (_, row) => items[(col + row * stride) % count],
        ),
    );
}

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ');

const prefersReducedMotion = (): boolean =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const columnFactor = (index: number, variance: number): number => {
    const pseudo = ((index * 0.6180339887 + 0.35) % 1) * 2 - 1;
    return 1 + variance * pseudo;
};

const DriftWall = ({
    items = DEFAULT_ITEMS,
    columns = 5,
    tileWidth = 200,
    tileHeight = 132,
    gap = 18,
    radius = 14,
    tilt = 16,
    turn = -14,
    roll = 0,
    perspective = 1200,
    depth = 120,
    speed = 42,
    direction = 'up',
    variance = 0.45,
    parallax = 0.6,
    pauseOnHover = false,
    lift = 64,
    fade = 0.6,
    dim = 0.55,
    overlayOpacity = 0.42,
    grayscale = false,
    overlayColor = 'var(--bg)',
    offsetX = 0,
    className = '',
    style
}: DriftWallProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const planeRef = useRef<HTMLDivElement>(null);
    const trackRefs = useRef<(HTMLDivElement | null)[]>([]);
    const rafRef = useRef<number | null>(null);

    const offsetsRef = useRef<number[]>([]);
    const velocitiesRef = useRef<number[]>([]);
    const hoveredColRef = useRef<number>(-1);
    const wallHoveredRef = useRef<boolean>(false);
    const pointerRef = useRef({ x: 0, y: 0 });
    const pointerDampedRef = useRef({ x: 0, y: 0 });
    const lastTsRef = useRef<number | null>(null);

    const [containerHeight, setContainerHeight] = useState(600);
    const [activeId, setActiveId] = useState<string | null>(null);
    const activeIdRef = useRef<string | null>(null);
    const [reduced, setReduced] = useState(() => prefersReducedMotion());

    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    const columnItems = useMemo<DriftWallItem[][]>(
        () => buildColumns(items, columns),
        [items, columns],
    );

    const columnMeta = useMemo<ColumnMeta[]>(() => {
        const unit = tileHeight + gap;
        return columnItems.map(col => {
            const copyHeight = Math.max(unit, col.length * unit);
            const copies = Math.max(2, Math.ceil((containerHeight * 1.6) / copyHeight) + 1);
            return { copyHeight, copies };
        });
    }, [columnItems, tileHeight, gap, containerHeight]);

    useLayoutEffect(() => {
        if (!containerRef.current) return;
        const ro = new ResizeObserver(([entry]) => {
            setContainerHeight(entry.contentRect.height || 600);
        });
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    const baseVelocities = useMemo<number[]>(() => {
        const dirSign = direction === 'up' ? 1 : -1;
        return columnItems.map((_, c) => {
            const altSign = c % 2 === 0 ? 1 : -1;
            return speed * columnFactor(c, variance) * dirSign * altSign;
        });
    }, [columnItems, speed, direction, variance]);

    useEffect(() => {
        offsetsRef.current = columnMeta.map((meta, c) => meta.copyHeight * ((c * 0.37) % 1));
        velocitiesRef.current = columnItems.map(() => 0);
    }, [columnMeta, columnItems]);

    const applyPlaneTransform = useCallback(
        (px: number, py: number) => {
            const plane = planeRef.current;
            if (!plane) return;
            plane.style.transform =
                `translate(calc(-50% + ${offsetX}%), -50%) scale(1.18) ` +
                `rotateX(${tilt + py}deg) rotateY(${turn + px}deg) rotateZ(${roll}deg) ` +
                `translateZ(${-depth}px)`;
        },
        [tilt, turn, roll, depth, offsetX]
    );

    useEffect(() => {
        const animate = (ts: number) => {
            if (lastTsRef.current === null) lastTsRef.current = ts;
            const dt = Math.min(0.05, Math.max(0, ts - lastTsRef.current) / 1000);
            lastTsRef.current = ts;

            const maxTilt = parallax * 8;
            const targetX = pointerRef.current.x * maxTilt;
            const targetY = -pointerRef.current.y * maxTilt;
            const damp = 1 - Math.exp(-dt / 0.12);
            pointerDampedRef.current.x += (targetX - pointerDampedRef.current.x) * damp;
            pointerDampedRef.current.y += (targetY - pointerDampedRef.current.y) * damp;
            applyPlaneTransform(pointerDampedRef.current.x, pointerDampedRef.current.y);

            if (!reduced) {
                for (let c = 0; c < trackRefs.current.length; c++) {
                    const meta = columnMeta[c];
                    if (!meta) continue;
                    const paused = wallHoveredRef.current && pauseOnHover;
                    const factor = paused || hoveredColRef.current === c ? 0 : 1;
                    const target = baseVelocities[c] * factor;

                    const ease = 1 - Math.exp(-dt / (target === 0 ? 0.16 : 0.28));
                    velocitiesRef.current[c] += (target - velocitiesRef.current[c]) * ease;
                    let next = (offsetsRef.current[c] ?? 0) + velocitiesRef.current[c] * dt;
                    next = ((next % meta.copyHeight) + meta.copyHeight) % meta.copyHeight;
                    offsetsRef.current[c] = next;

                    const el = trackRefs.current[c];
                    if (el) el.style.transform = `translate3d(0, ${-next}px, 0)`;
                }
            } else {
                for (let c = 0; c < trackRefs.current.length; c++) {
                    const el = trackRefs.current[c];
                    const meta = columnMeta[c];
                    if (el && meta) el.style.transform = `translate3d(0, ${-(offsetsRef.current[c] ?? 0)}px, 0)`;
                }
            }

            rafRef.current = requestAnimationFrame(animate);
        };

        rafRef.current = requestAnimationFrame(animate);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
            lastTsRef.current = null;
        };
    }, [baseVelocities, columnMeta, pauseOnHover, parallax, reduced, applyPlaneTransform]);

    const activate = useCallback((id: string, index: number): void => {
        activeIdRef.current = id;
        hoveredColRef.current = index;
        setActiveId(id);
    }, []);
    const release = useCallback((): void => {
        activeIdRef.current = null;
        hoveredColRef.current = -1;
        setActiveId(null);
    }, []);

    const handlePointerMove = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;
            if (parallax > 0 && !reduced) {
                pointerRef.current = {
                    x: (e.clientX - rect.left) / rect.width - 0.5,
                    y: (e.clientY - rect.top) / rect.height - 0.5
                };
            }
            const hit = document.elementFromPoint(e.clientX, e.clientY);
            const tile = hit && hit.closest ? (hit.closest('[data-tile-id]') as HTMLElement | null) : null;
            if (!tile) return;
            const id = tile.dataset.tileId ?? null;
            if (id === activeIdRef.current) return;
            activeIdRef.current = id;
            hoveredColRef.current = Number(tile.dataset.col);
            setActiveId(id);
        },
        [parallax, reduced]
    );

    const handlePointerLeaveWall = useCallback((): void => {
        wallHoveredRef.current = false;
        pointerRef.current = { x: 0, y: 0 };
        release();
    }, [release]);

    const maskStyle =
        'radial-gradient(ellipse 78% 82% at 50% 46%, #000 var(--dw-edge), transparent 100%), ' +
        'linear-gradient(to top, #000 var(--dw-edge), transparent 100%)';

    const cssVars = useMemo<CSSProperties>(
        () =>
            ({
                '--dw-tile-w': `${tileWidth}px`,
                '--dw-tile-h': `${tileHeight}px`,
                '--dw-gap': `${gap}px`,
                '--dw-radius': `${radius}px`,
                '--dw-lift': `${lift}px`,
                '--dw-dim': dim,
                '--dw-gray': grayscale ? 1 : 0,
                '--dw-overlay': overlayColor,
                '--dw-overlay-op': overlayOpacity,
                '--dw-edge': `${Math.max(0, (1 - fade) * 100)}%`,
                perspective: `${perspective}px`,
                perspectiveOrigin: '50% 50%',
                WebkitMaskImage: maskStyle,
                maskImage: maskStyle,
                WebkitMaskComposite: 'source-in',
                maskComposite: 'intersect',
                ...style
            }) as CSSProperties,
        [tileWidth, tileHeight, gap, radius, lift, dim, grayscale, overlayColor, overlayOpacity, fade, perspective, maskStyle, style]
    );

    const tileClass = cx(
        'group/tile relative block flex-none cursor-pointer outline-none',
        'w-full h-[calc(var(--dw-tile-h)+var(--dw-gap))] [transform-style:preserve-3d]'
    );
    const innerClass = cx(
        'pointer-events-none absolute inset-[calc(var(--dw-gap)/2)] block overflow-hidden bg-[var(--bg-deep)]',
        'rounded-[var(--dw-radius)] opacity-[var(--dw-dim)] [transform:translateZ(0)]',
        'transition-[transform,opacity,box-shadow] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
        'group-[.is-active]/tile:opacity-100 group-[.is-active]/tile:[transform:translateZ(var(--dw-lift))]',
        'group-[.is-active]/tile:shadow-[0_24px_60px_-18px_rgba(0,0,0,0.7)]',
        'group-focus-visible/tile:opacity-100 group-focus-visible/tile:[transform:translateZ(var(--dw-lift))]',
        'group-focus-visible/tile:shadow-[0_24px_60px_-18px_rgba(0,0,0,0.7),0_0_0_2px_var(--accent)]'
    );
    const imgClass = cx(
        'block h-full w-full select-none object-cover',
        '[filter:grayscale(var(--dw-gray))_saturate(0.92)]',
        'transition-[filter] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
        'group-[.is-active]/tile:[filter:grayscale(0)_saturate(1.05)] group-focus-visible/tile:[filter:grayscale(0)_saturate(1.05)]'
    );
    const overlayClass = cx(
        'pointer-events-none absolute inset-0 bg-[var(--dw-overlay)] opacity-[var(--dw-overlay-op)]',
        'transition-opacity duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
        'group-[.is-active]/tile:opacity-0 group-focus-visible/tile:opacity-0'
    );

    const renderTile = (item: DriftWallItem, id: string, colIndex: number) => {
        const inner = (
            <span className={innerClass}>
                <Image
                    src={item.image}
                    alt={item.title ?? ''}
                    fill
                    sizes={`${tileWidth}px`}
                    loading="lazy"
                    draggable={false}
                    className={imgClass}
                />
                <span className={overlayClass} aria-hidden="true" />
            </span>
        );
        const commonProps = {
            className: cx(tileClass, activeId === id && 'is-active'),
            'data-tile-id': id,
            'data-col': colIndex,
            onFocus: () => activate(id, colIndex),
            onBlur: release
        };
        if (item.href) {
            return (
                <a key={id} href={item.href} target="_blank" rel="noreferrer noopener" {...commonProps}>
                    {inner}
                </a>
            );
        }
        return (
            <div key={id} tabIndex={0} role="button" aria-label={item.title ?? 'tile'} {...commonProps}>
                {inner}
            </div>
        );
    };

    return (
        <div
            ref={containerRef}
            className={cx('relative h-full w-full overflow-hidden', className)}
            style={cssVars}
            onPointerMove={handlePointerMove}
            onPointerEnter={() => {
                wallHoveredRef.current = true;
            }}
            onPointerLeave={handlePointerLeaveWall}
            role="group"
            aria-label="Drifting wall of tiles"
        >
            <div
                ref={planeRef}
                className="absolute left-1/2 top-1/2 flex cursor-pointer flex-row [transform-style:preserve-3d] [transform-origin:50%_50%] will-change-transform"
            >
                {columnItems.map((col, c) => {
                    const meta = columnMeta[c];
                    const copies = Array.from({ length: meta.copies });
                    return (
                        <div
                            className="relative w-[calc(var(--dw-tile-w)+var(--dw-gap))] [transform-style:preserve-3d]"
                            key={`col-${c}`}
                        >
                            <div
                                className="flex flex-col [transform-style:preserve-3d] will-change-transform"
                                ref={el => {
                                    trackRefs.current[c] = el;
                                }}
                            >
                                {copies.map((_, copyIndex) =>
                                    col.map((item, itemIndex) => renderTile(item, `${c}-${copyIndex}-${itemIndex}`, c))
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default DriftWall;