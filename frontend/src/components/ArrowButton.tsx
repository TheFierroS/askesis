"use client";

/**
 * Soru ileri/geri butonu (uiverse: xopc333).
 *
 * Hover'da dış halka büzülüp yerini renkli halkaya bırakıyor, ok kayarak
 * ikizine yer açıyor. Stiller globals.css'teki .arrow-btn bloğunda; renkler
 * temadan geliyor, tema değişince buton da dönüyor.
 *
 * Geri butonu ayrı bir çizim değil: aynı bileşen yatayda aynalanıyor.
 * Tek bir SVG yolu bakımı kolaylaştırıyor.
 */

const ARROW_PATH =
    "M46 20.038c0-.7-.3-1.5-.8-2.1l-16-17c-1.1-1-3.2-1.4-4.4-.3-1.2 1.1-1.2 3.3 0 4.4l11.3 11.9H3c-1.7 0-3 1.3-3 3s1.3 3 3 3h33.1l-11.3 11.9c-1 1-1.2 3.3 0 4.4 1.2 1.1 3.3.8 4.4-.3l16-17c.5-.5.8-1.1.8-1.9z";

export default function ArrowButton({
    direction,
    onClick,
    disabled = false,
    label,
    className = "",
}: {
    direction: "back" | "forward";
    onClick: () => void;
    disabled?: boolean;
    label: string;
    className?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            className={`arrow-btn ${direction === "back" ? "arrow-btn--back" : ""} ${className}`}
        >
            <span className="arrow-btn__box">
                {/* İki ok: biri kayarak çıkarken diğeri yerine giriyor. */}
                {[0, 1].map((index) => (
                    <span className="arrow-btn__icon" key={index}>
                        <svg viewBox="0 0 46 40" xmlns="http://www.w3.org/2000/svg">
                            <path d={ARROW_PATH} />
                        </svg>
                    </span>
                ))}
            </span>
        </button>
    );
}