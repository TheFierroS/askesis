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

export async function fetchPublicCourses(): Promise<PublicCourse[]> {
    const response = await fetch(`${BASE_URL}/public/courses`, {
        next: { revalidate: REVALIDATE_SECONDS },
    });

    // Backend kapalıysa sayfa çökmemeli: boş liste dönüp sayfa yine oluşuyor.
    if (!response.ok) return [];

    return response.json();
}

export async function fetchPublicCourse(
    slug: string,
): Promise<PublicCourseDetail | null> {
    const response = await fetch(`${BASE_URL}/public/courses/${slug}`, {
        next: { revalidate: REVALIDATE_SECONDS },
    });

    // 404 burada hata değil: bilinmeyen bir slug istenmiş olabilir. Çağıran
    // taraf bunu notFound()'a çeviriyor.
    if (!response.ok) return null;

    return response.json();
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