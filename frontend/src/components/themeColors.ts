"use client";

import { useTheme, type Theme } from "./ThemeProvider";

/**
 * globals.css'teki token'ların JS karşılığı.
 *
 * Neden ikinci bir kaynak var?
 * StrokeText / DriftWall / CursorGlow gibi komponentlere rengi prop olarak
 * geçiyoruz ve içeride `${color}CC` gibi hex birleştirmeleri, SVG presentation
 * attribute'ları (stroke="...") kullanılıyor. Bunların hiçbiri var(--x) kabul
 * etmiyor — gerçek hex lazım.
 *
 * Kural: CSS'e yazabiliyorsan var(--token), prop olarak geçmen gerekiyorsa
 * useThemeColors(). İkisini de değiştirirken senkron tut.
 */
export interface ThemeColors {
    bg: string;
    bgDeep: string;
    bgElevated: string;
    fg: string;
    fgMuted: string;
    fgFaint: string;
    accent: string;
    accentSolid: string;
    /** Üçlü vurgu seti — adımlar, form alanları ve kartlar arasında dönüyor */
    accent2: string;
    accent3: string;
    highlight: string;
    success: string;
    border: string;
    surface: string;
    /** hover gölgeleri için accent + alpha */
    accentGlow: string;
}

// Record<Theme, ThemeColors> şart: `as const` kullanılırsa her renk literal tipe
// dönüşüyor ("#272727" gibi) ve light objesi dark'ın tipine uymuyor.
export const themeColors: Record<Theme, ThemeColors> = {
    dark: {
        bg: "#272727",
        bgDeep: "#1C1C1C",
        bgElevated: "#2F2F2F",
        fg: "#EAE7DC",
        fgMuted: "#9A9894",
        fgFaint: "#747474",
        accent: "#FF652F",
        accentSolid: "#FF652F",
        accent2: "#FFE400",
        accent3: "#14A76C",
        highlight: "#FFE400",
        success: "#14A76C",
        border: "rgba(234,231,220,0.14)",
        surface: "rgba(234,231,220,0.045)",
        accentGlow: "rgba(255,101,47,0.45)",
    },
    light: {
        bg: "#EAE7DC",
        bgDeep: "#DDD9CB",
        bgElevated: "#F3F1E9",
        fg: "#272727",
        fgMuted: "#6E6D6A",
        fgFaint: "#8E8D8A",
        accent: "#E85A4F",
        accentSolid: "#C7443A",
        // Açık paletin kendi renkleri: mercan → somon → mürekkep
        accent2: "#E98074",
        accent3: "#272727",
        highlight: "#E98074",
        // success sadece form doğrulama gibi işlevsel durumlar için
        success: "#0F8557",
        border: "rgba(142,141,138,0.30)",
        surface: "rgba(216,195,165,0.30)",
        accentGlow: "rgba(232,90,79,0.40)",
    },
};

export function useThemeColors(): ThemeColors {
    const { theme } = useTheme();
    return themeColors[theme];
}

/** Sırayla dönen üçlü vurgu seti — i. öğeye renk atamak için */
export function accentAt(c: ThemeColors, i: number): string {
    return [c.accent, c.accent2, c.accent3][i % 3];
}