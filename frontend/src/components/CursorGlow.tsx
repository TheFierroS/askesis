"use client";

import { useEffect, useRef } from "react";
import { useThemeColors } from "./themeColors";

/**
 * color prop'u gerçek hex olmalı: içeride `${color}14` şeklinde alpha
 * ekleniyor ve var(--accent) ile bu birleştirme çalışmaz.
 * Bu yüzden varsayılan değer useThemeColors()'tan geliyor.
 */
export default function CursorGlow({ color }: { color?: string }) {
    const c = useThemeColors();
    const glowColor = color ?? c.accent;

    const ref = useRef<HTMLDivElement>(null);
    const pos = useRef({ x: 0, y: 0 });
    const target = useRef({ x: 0, y: 0 });
    const raf = useRef<number | null>(null);

    useEffect(() => {
        const isTouch = window.matchMedia("(pointer: coarse)").matches;
        if (isTouch) return undefined;

        const onMove = (e: MouseEvent) => {
            target.current = { x: e.clientX, y: e.clientY };
        };
        window.addEventListener("mousemove", onMove);

        const tick = () => {
            pos.current.x += (target.current.x - pos.current.x) * 0.08;
            pos.current.y += (target.current.y - pos.current.y) * 0.08;
            if (ref.current) {
                ref.current.style.transform = `translate3d(${pos.current.x - 250}px, ${pos.current.y - 250}px, 0)`;
            }
            raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);

        return () => {
            window.removeEventListener("mousemove", onMove);
            if (raf.current) cancelAnimationFrame(raf.current);
        };
    }, []);

    return (
        <div
            ref={ref}
            className="pointer-events-none fixed top-0 left-0 w-[500px] h-[500px] rounded-full hidden md:block"
            style={{
                background: `radial-gradient(circle, ${glowColor}14 0%, transparent 70%)`,
                filter: "blur(20px)",
                zIndex: 0,
                willChange: "transform",
            }}
        />
    );
}