import type { MetadataRoute } from "next";

import { fetchPublicCourses } from "../lib/publicApi";

const BASE = "https://askesisapp.net";

/**
 * Sitemap saatte bir yeniden üretiliyor.
 *
 * Varsayılan davranışta yalnızca derleme anında oluşuyordu ve orada donuyordu:
 * yeni bir dersin havuzu eşiği geçtiğinde sitemap'e girmesi için elle yeniden
 * yayın gerekiyordu. Nitekim slug yapısını değiştirdiğimizde Vercel, sunucuda
 * git pull yapılmadan önce derledi ve haritada eski adresler kaldı.
 */
export const revalidate = 3600;

/**
 * Site haritası.
 *
 * Ders sayfaları elle yazılmıyor: backend hangi derslerin havuzu hazırsa onu
 * döndürüyor ve liste ona göre kuruluyor. Yeni bir ders eşiği geçtiğinde
 * sitemap'e kendiliğinden giriyor, yeniden yayın gerekmiyor.
 *
 * Backend'e ulaşılamazsa fetchPublicCourses boş liste döndürüyor ve sitemap
 * yalnızca sabit sayfalarla oluşuyor. Hata vermek yerine eksik bir harita
 * vermek daha iyi: Google boş bir yanıt yerine kısa bir harita alıyor.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const courses = await fetchPublicCourses();

    const coursePages: MetadataRoute.Sitemap = courses.map((course) => ({
        url: `${BASE}/courses/${course.slug}`,
        // Havuza en son ne zaman soru eklendiği. Google'a sayfanın gerçekten
        // değiştiğini söylüyor; her taramada "bugün" yazmak sinyali
        // değersizleştirirdi.
        lastModified: new Date(course.updated_at),
        changeFrequency: "weekly",
        priority: 0.8,
    }));

    return [
        {
            url: BASE,
            lastModified: new Date(),
            changeFrequency: "weekly",
            priority: 1,
        },
        {
            url: `${BASE}/courses`,
            lastModified: new Date(),
            changeFrequency: "weekly",
            priority: 0.9,
        },
        ...coursePages,
    ];
}