/**
 * Kredi paketleri.
 *
 * Tek kaynak: hem ana sayfadaki fiyatlandırma bölümü hem dashboard'daki satın
 * alma modalı buradan besleniyor. Fiyat değiştirmek istediğinde tek dosya.
 *
 * ÖDEME ENTEGRASYONU
 * `checkoutUrl` şu an boş. Lemon Squeezy mağazası kurulup ürünler
 * tanımlandığında her paketin checkout bağlantısını buraya yazacaksın:
 *
 *   checkoutUrl: "https://elenchus.lemonsqueezy.com/checkout/buy/xxxx"
 *
 * Boş kaldığı sürece butonlar "coming soon" olarak görünüyor. Kod tarafında
 * başka bir değişiklik gerekmiyor.
 */

export interface CreditPackage {
    id: string;
    name: string;
    /** Kaç soru hakkı verdiği. */
    credits: number;
    /** Gösterilecek fiyat metni. */
    price: string;
    /** Kısa açıklama — kimin için uygun olduğu. */
    blurb: string;
    /** Vurgulanan paket. Listede biri öne çıkmazsa göz karar veremiyor. */
    featured?: boolean;
    checkoutUrl?: string;
}

/** Yeni hesaba verilen ücretsiz hak. Backend'deki FREE_CREDITS ile aynı olmalı. */
export const FREE_CREDITS = 20;

export const PACKAGES: CreditPackage[] = [
    {
        id: "starter",
        name: "Starter",
        credits: 50,
        price: "₺49",
        blurb: "A few sessions before a quiz. Around ten short practice sets.",
    },
    {
        id: "standard",
        name: "Standard",
        credits: 150,
        price: "₺119",
        blurb: "A full course to get through. Works out cheaper per question.",
        featured: true,
    },
    {
        id: "season",
        name: "Exam season",
        credits: 400,
        price: "₺249",
        blurb: "Several courses, a whole term. The lowest price per question.",
    },
];

/** Soru başına düşen fiyat — paketler arası farkı görünür kılıyor. */
export function perQuestion(pkg: CreditPackage): string {
    const amount = Number.parseFloat(pkg.price.replace(/[^\d.,]/g, "").replace(",", "."));
    if (!Number.isFinite(amount)) return "";
    return `₺${(amount / pkg.credits).toFixed(2)} per question`;
}