/**
 * Marka bilgisi — tek kaynak.
 *
 * Site adı, sloganı ve logosu yalnızca burada tanımlı. Adı değiştirmek
 * istediğinde tek satır yeterli: sayfa başlıkları, üst barlar, PDF çıktısı ve
 * meta etiketleri buradan besleniyor.
 *
 * Neden sabit metin yerine modül?
 * "Sinav AI" yazısı dosyalara serpilseydi isim değişikliği on ayrı yerde
 * arama-değiştirme demek olurdu ve biri mutlaka atlanırdı — genelde de en
 * görünür yer, tarayıcı sekmesi.
 */

export const BRAND = {
    /** Görünen ad. Değiştirmek için burası yeterli. */
    name: "Askesis",

    /**
     * Adın kökeni — "hakkında" bölümünde veya footer'da kullanılabilir.
     * Yunanca ἄσκησις: çalışma, alıştırma, disiplinli tekrar. Hem atletin
     * antrenmanı hem filozofun kendini yetiştirmesi için kullanılırdı.
     */
    origin: "Greek ἄσκησις — training, practice, disciplined repetition",

    /** Hero altındaki tek cümlelik vaat. */
    tagline: "Practice questions from your actual past exams",

    /**
     * Logo dosyası — TEK dosya yeterli.
     *
     * Rengi CSS veriyor: görselin saydamlık kanalı kalıp olarak kullanılıyor
     * (CSS mask) ve içi metin rengiyle dolduruluyor. Yani logo koyu temada
     * krem, açık temada mürekkep rengi oluyor; tema değişiminde de diğer her
     * şeyle birlikte yumuşakça dönüyor.
     *
     * Bunun iki faydası var: iki ayrı dosya tutup senkron kalmalarına dikkat
     * etmek gerekmiyor, ve ileride vurgu rengini değiştirirsen logo
     * kendiliğinden uyuyor.
     *
     * Dosyanın hangi renkte olduğu ÖNEMSİZ — yalnızca şeklin saydamlık
     * sınırları kullanılıyor. Beyaz da olur siyah da. Ama arka planı gerçekten
     * saydam olmalı: dolu bir zemin varsa maske o zemini de şeklin parçası
     * sayar ve dolu bir dikdörtgen görürsün.
     */
    logo: "/logo_white.png",

    /**
     * Logonun genişlik/yükseklik oranı.
     *
     * Kare bir işaret için 1, yatay bir kilit için 3-4 civarı. Yanlış oran
     * logoyu eziyor; dosyanın gerçek en/boy oranını yaz.
     */
    logoAspect: 1,
} as const;

/**
 * Favicon notu:
 * Next.js `src/app/favicon.ico` dosyasını otomatik kullanıyor. Logon hazır
 * olunca o dosyayı değiştirmen yeterli, kodda bir şey yapmana gerek yok.
 */