"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useSyncExternalStore,
} from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "askesis-theme";
const DEFAULT_THEME: Theme = "dark";

/**
 * <head> içine inline olarak basılan script.
 * React hydrate olmadan ÖNCE çalışır; böylece kullanıcı dark seçtiyse
 * sayfa bir an light yanıp sönmez (FOUC / theme flash).
 * layout.tsx içinde dangerouslySetInnerHTML ile veriliyor.
 */
export const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem("${STORAGE_KEY}");
    var theme = stored === "light" || stored === "dark" ? stored : "${DEFAULT_THEME}";
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "${DEFAULT_THEME}");
  }
})();
`;

/**
 * Tema DOM'da yaşıyor, React state'inde değil.
 *
 * Önceki sürüm temayı hem `data-theme` niteliğinde hem useState'te tutuyordu.
 * İki kaynak olunca senkron tutmak için effect içinde setState çağırmak
 * gerekiyordu — React bunu zincirleme render riski olarak işaretliyor, haklı
 * olarak da: değeri zaten bilen bir yer varken ikinci bir kopya tutmak
 * gereksiz.
 *
 * useSyncExternalStore tam bu iş için var: React dışında yaşayan bir değeri
 * (burada DOM niteliği) okumak ve değişince yeniden render etmek. Sunucu
 * tarafında `getServerSnapshot` devreye giriyor, hydration uyuşmazlığı olmuyor.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function notify(): void {
    listeners.forEach((listener) => listener());
}

function readTheme(): Theme {
    const attr = document.documentElement.getAttribute("data-theme");
    return attr === "light" || attr === "dark" ? attr : DEFAULT_THEME;
}

/** Sunucuda DOM yok; script'in yazacağı varsayılanı bildiriyoruz. */
function serverTheme(): Theme {
    return DEFAULT_THEME;
}

/** İstemcide çalışıp çalışmadığımızı state tutmadan öğrenmenin yolu. */
const mountedSubscribe = () => () => {};

interface ThemeContextValue {
    theme: Theme;
    setTheme: (t: Theme) => void;
    toggleTheme: () => void;
    /** İlk client render'ından sonra true olur. */
    mounted: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const theme = useSyncExternalStore(subscribe, readTheme, serverTheme);
    const mounted = useSyncExternalStore(
        mountedSubscribe,
        () => true,
        () => false,
    );

    useEffect(() => {
        // Tema geçiş animasyonu ilk boyamadan sonra devreye girsin: sayfa
        // açılırken renklerin akmasını istemiyoruz.
        const id = window.requestAnimationFrame(() =>
            document.documentElement.classList.add("theme-ready"),
        );
        return () => window.cancelAnimationFrame(id);
    }, []);

    const setTheme = useCallback((next: Theme) => {
        const root = document.documentElement;

        /**
         * Tema değişirken eleman seviyesindeki geçişleri susturuyoruz.
         *
         * Renkler CSS değişkenlerinden geliyor ve o değişkenler zaten 0.35s
         * boyunca animasyonda. Bir elemanda ayrıca `transition: colors` varsa
         * (Tailwind'in transition-colors sınıfı, .icon üzerindeki
         * `transition: all` gibi) o eleman HAREKETLİ bir hedefe doğru ikinci
         * bir animasyon çalıştırıyor. Sonuç: bazı butonlar ve kutular geriden
         * geliyor, ekran tek parça dönmüyor.
         */
        root.classList.add("theme-switching");
        window.setTimeout(() => root.classList.remove("theme-switching"), 400);

        root.setAttribute("data-theme", next);
        root.style.colorScheme = next;

        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // private mode / storage kapalı — tema yine de bu oturumda çalışır
        }

        // DOM güncellendi; aboneleri haberdar et.
        notify();
    }, []);

    const toggleTheme = useCallback(
        () => setTheme(theme === "dark" ? "light" : "dark"),
        [theme, setTheme],
    );

    return (
        <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, mounted }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
    return ctx;
}