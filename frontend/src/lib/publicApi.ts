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
 * Backend'e ulaşılamadığında fırlatılıyor.
 *
 * "Sunucu 404 dedi" ile "sunucuya hiç ulaşamadım" ayrı şeyler ve bu ayrım
 * kritik: ikisini aynı kefeye koyarsak, ağ bir an tıkandığında var olan bir
 * dersin sayfası 404 olarak STATİK ÜRETİLİYOR ve API düzeldikten sonra bile
 * 404 kalmaya devam ediyor.
 */
export class UpstreamUnavailable extends Error {
    constructor(path: string, cause: unknown) {
        super(`[publicApi] ${path} alınamadı: ${describe(cause)}`);
        this.name = "UpstreamUnavailable";
    }
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * fetch + JSON.
 *
 * `response.ok` kontrolü tek başına yetmiyor: o yalnızca sunucunun cevap
 * verdiği durumları kapsıyor. Bağlantı hiç kurulamazsa fetch bir Response
 * döndürmüyor, exception fırlatıyor — DNS çözülemez, zaman aşımı, reddedilen
 * sertifika. Yakalanmazsa derleme "Collecting page data" adımında düşüyor.
 *
 * Bu yüzden üç durumu ayırıyoruz:
 *   - 200        → veri
 *   - 404        → notFoundValue (gerçekten yok)
 *   - ağ / 5xx   → UpstreamUnavailable fırlat
 *
 * Sonuncusunu çağıran taraf duruma göre ele alıyor: liste sayfası boş
 * listeyle devam edebilir, ders sayfası edemez.
 */
async function getJson<T>(path: string, notFoundValue: T): Promise<T> {
    let response: Response;

    try {
        response = await fetch(`${BASE_URL}${path}`, {
            next: { revalidate: REVALIDATE_SECONDS },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
    } catch (error) {
        throw new UpstreamUnavailable(path, error);
    }

    // Yalnızca 404 "yok" demek. 500 veya 502 sunucunun geçici derdi ve o anki
    // hâlini kalıcı bir 404 olarak dondurmamalıyız.
    if (response.status === 404) return notFoundValue;
    if (!response.ok) {
        throw new UpstreamUnavailable(path, `HTTP ${response.status}`);
    }

    try {
        return (await response.json()) as T;
    } catch (error) {
        throw new UpstreamUnavailable(path, error);
    }
}

/**
 * Ders listesi. Ulaşılamazsa BOŞ liste.
 *
 * Burada yutmak güvenli: eksik bir sitemap ya da "henüz ders yok" diyen bir
 * dizin sayfası, düşmüş bir dağıtımdan iyi. Bir saat sonra kendiliğinden
 * doluyor.
 */
export async function fetchPublicCourses(): Promise<PublicCourse[]> {
    try {
        return await getJson<PublicCourse[]>("/public/courses", []);
    } catch (error) {
        console.warn(describe(error), "— boş listeyle devam ediliyor");
        return [];
    }
}

/**
 * Tek dersin detayı. Ulaşılamazsa FIRLATIYOR, null dönmüyor.
 *
 * Bilerek: null dönseydi çağıran taraf notFound() çağırır ve Next.js o 404'ü
 * statik olarak pişirirdi. Var olan bir dersin sayfası, API bir an takıldı
 * diye kalıcı 404 olur. Fırlatmak ise sayfayı üretilmemiş bırakıyor; sonraki
 * istekte yeniden deneniyor.
 *
 * Sunucu 404 derse null dönüyor — o gerçekten olmayan bir ders.
 */
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