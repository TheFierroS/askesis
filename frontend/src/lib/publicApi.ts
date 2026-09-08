/**
 * Herkese açık uç noktalar.
 *
 * api.ts'ten ayrı, çünkü orası her isteğe Clerk token'ı ekliyor ve tarayıcıda
 * çalışıyor. Bunlar ise kimlik istemiyor ve SUNUCUDA çağrılıyor: ders sayfası
 * sunucu bileşeni olarak oluşturuluyor, böylece içerik ilk HTML'de yer alıyor
 * ve arama motoru onu görüyor.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export interface PublicCourse {
    /**
     * Ders + sınav türü: "linear-algebra-midterm".
     *
     * Tür slug'a dahil çünkü vize ve final farklı konuları ölçüyor ve farklı
     * aramalarla bulunuyor. Ayrıca tür olmadan slug çakışıyordu: aynı dersin
     * iki sınavı aynı adresi üretiyor, ikincisi erişilemez kalıyordu.
     */
    slug: string;
    course: string;
    exam_type: string;
    question_count: number;
    updated_at: string;
}

export interface PublicTopic {
    topic: string;
    count: number;
}

export interface PublicSample {
    id: string;
    prompt: string;
    topic: string;
    difficulty: "easy" | "medium" | "hard";
}

export interface PublicSibling {
    slug: string;
    exam_type: string;
}

export interface PublicCourseDetail extends PublicCourse {
    topics: PublicTopic[];
    samples: PublicSample[];
    /**
     * Aynı dersin diğer sınav türleri.
     *
     * Vize ve final ayrı sayfalar, ama öğrenci birinden diğerine geçebilmeli.
     * Kendisi de listede: seçicide hangisinde olduğunu işaretlemek için.
     */
    siblings: PublicSibling[];
}

/**
 * Sayfaların yeniden oluşturulma sıklığı (saniye).
 *
 * Havuz sürekli büyüyor ama sayfadaki sayı birkaç saat eski olabilir, kimse
 * fark etmez. Her istekte backend'e gitmek gereksiz yük; tamamen statik
 * yapmak ise yeni eklenen dersleri günlerce gizler.
 */
const REVALIDATE_SECONDS = 3600;

/**
 * Tek bir istek için üst süre sınırı (ms).
 *
 * Node'un fetch'i varsayılan olarak 10 saniye bekliyor ve bu Vercel'in derleme
 * adımını kilitliyor. Sekiz saniye, yavaş bir yanıtı beklemeye yeter ama
 * ulaşılamayan bir sunucuda derlemeyi oyalamaz.
 */
const TIMEOUT_MS = 8000;

/**
 * fetch + JSON, ağ hataları yutularak.
 *
 * Kritik nokta: `response.ok` kontrolü YETMİYOR. O yalnızca sunucunun cevap
 * verdiği durumları kapsıyor (404, 500 gibi). Bağlantı hiç kurulamazsa fetch
 * bir Response döndürmüyor, exception fırlatıyor — DNS çözülemez, bağlantı
 * zaman aşımına uğrar, sertifika reddedilir. O exception yakalanmazsa
 * derleme sırasında "Collecting page data" adımında dağıtımın tamamı düşüyor.
 *
 * Sunucunun anlık durumu yayına engel olmamalı: erişilemiyorsa sayfa yedek
 * değerle oluşuyor, bir saat sonraki yeniden doğrulamada kendiliğinden
 * düzeliyor.
 */
async function getJson<T>(path: string, fallback: T): Promise<T> {
    try {
        const response = await fetch(`${BASE_URL}${path}`, {
            next: { revalidate: REVALIDATE_SECONDS },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        // 404 burada hata değil: bilinmeyen bir slug istenmiş olabilir.
        // Çağıran taraf yedek değeri notFound()'a çeviriyor.
        if (!response.ok) return fallback;

        return (await response.json()) as T;
    } catch (error) {
        // Derleme logunda görünsün: sayfa boş çıktığında sebebini aramak
        // yerine doğrudan burada okunuyor.
        console.warn(
            `[publicApi] ${path} alınamadı, yedek değerle devam ediliyor:`,
            error instanceof Error ? error.message : error,
        );
        return fallback;
    }
}

export async function fetchPublicCourses(): Promise<PublicCourse[]> {
    return getJson<PublicCourse[]>("/public/courses", []);
}

export async function fetchPublicCourse(
    slug: string,
): Promise<PublicCourseDetail | null> {
    return getJson<PublicCourseDetail | null>(`/public/courses/${slug}`, null);
}

/**
 * Etiketleri okunur hale getirir: "matrix inverse" -> "Matrix Inverse".
 *
 * Etiketler veritabanında tamamen küçük harf duruyor — aynı kavramın büyük
 * harf varyasyonlarıyla ayrı satırlara bölünmesini engellemek için. Ekranda
 * küçük harfli görünmeleri özensiz duruyor, o yüzden sunum katmanında
 * düzeltiyoruz.
 */
export function titleCase(text: string): string {
    return text.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}