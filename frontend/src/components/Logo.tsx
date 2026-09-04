"use client";

import { BRAND } from "../lib/brand";

/**
 * Marka işareti.
 *
 * İKİ LOGO, CSS İLE SEÇİM
 * Koyu temada beyaz logo, açık temada siyah logo gerekiyor. Hangisinin
 * gösterileceğini JavaScript ile seçmiyoruz: sayfa açılırken JS yüklenene
 * kadar yanlış logo görünür ve tema değiştiğinde de bir kare gecikmeyle
 * değişirdi. Bunun yerine ikisini de basıp CSS'e bırakıyoruz — `data-theme`
 * niteliği zaten <html> üzerinde ve inline script tarafından ilk boyamadan
 * önce yazılıyor.
 *
 * Logo dosyası yoksa yazı tipiyle bir işaret çiziyor, böylece dosyalar hazır
 * olmadan da site çalışıyor.
 */
export default function Logo({
    size = 30,
    showName = true,
    className = "",
}: {
    /** Yazı boyutu (px). Logo görseli buna göre ölçekleniyor. */
    size?: number;
    showName?: boolean;
    className?: string;
}) {
    const hasLogo = Boolean(BRAND.logo);
    const markSize = Math.round(size * 0.45);

    // Logo yazıdan belirgin şekilde büyük: işaret önce görülmeli, isim onu
    // tamamlamalı. Eşit boyda olduklarında ikisi de sıradan duruyor.
    //
    // Boyut CSS değişkeni olarak veriliyor, doğrudan width/height olarak
    // değil: mobilde küçültmeyi CSS yapıyor ve her çağrı yerinde ayrı bir
    // mobil değer geçirmek gerekmiyor.
    const height = Math.round(size * 2.2);

    return (
        <span
            className={`inline-flex items-center gap-2.5 ${className}`}
            style={{
                fontFamily: "var(--font-brand)",
                fontWeight: 400,
                // Custody el yazısı karakterli: aynı puntoda diğer fontlardan
                // belirgin şekilde küçük görünüyor.
                fontSize: size * 1.15,
                // Yazı logonun dikey ortasına hizalansın.
                lineHeight: 1,
                color: "var(--fg)",
                letterSpacing: "0.01em",
            }}
        >
            {hasLogo ? (
                /**
                 * Logo <img> DEĞİL, maskelenmiş bir kutu.
                 *
                 * Görselin saydamlık kanalı kalıp olarak kullanılıyor, içi
                 * metin rengiyle doluyor. Böylece tek dosya her iki temada da
                 * doğru renkte görünüyor ve tema geçişinde renk değişkeniyle
                 * birlikte yumuşakça dönüyor — iki ayrı dosya tutup
                 * senkron kalmalarına dikkat etmek gerekmiyor.
                 */
                <span
                    aria-hidden="true"
                    className="brand-logo"
                    style={
                        {
                            "--brand-logo-height": `${height}px`,
                            "--brand-logo-aspect": BRAND.logoAspect,
                            WebkitMaskImage: `url(${BRAND.logo})`,
                            maskImage: `url(${BRAND.logo})`,
                        } as React.CSSProperties
                    }
                />
            ) : (
                <span
                    aria-hidden="true"
                    className="rounded-full"
                    style={{
                        width: markSize,
                        height: markSize,
                        backgroundColor: "var(--accent)",
                        flexShrink: 0,
                    }}
                />
            )}

            {/* Ad mobilde gizleniyor: dar ekranda üst barı dolduruyor ve
                landing'de hero başlığının üstüne biniyordu. İşaret zaten
                markayı taşıyor.

                Gizleme CSS ile, koşullu render ile değil: iki ayrı Logo
                çağırıp birini `hidden sm:inline` yapmak Tailwind'in display
                sınıflarıyla çakışıyordu ve ikisi birden görünüyordu. */}
            <span className={showName ? "hidden sm:inline" : "sr-only"}>
                {BRAND.name}
            </span>
        </span>
    );
}