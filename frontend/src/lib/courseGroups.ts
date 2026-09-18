import type { PublicCourse } from "./publicApi";
import type { CourseGroup } from "../components/CourseSearch";

/**
 * Aynı dersin sınav türlerini tek karta toplar.
 *
 * Backend ders+tür başına bir kayıt döndürüyor, çünkü havuzlar öyle tutuluyor
 * ve sayfalar da öyle ayrılıyor (vize ve final farklı konuları ölçüyor).
 * Ama listede ham haliyle göstermek ders adını her tür için tekrar ediyor;
 * yüz dersin üç sınav türü olduğunda liste okunmaz hale gelirdi.
 *
 * Dönen değer Map değil dizi: istemci bileşenine prop olarak geçiyor ve Map
 * sunucu-istemci sınırından geçemiyor.
 *
 * Sayfadan buraya taşındı: aynı gruplama hem sunucu render'ında hem de
 * tarayıcıdaki yedek yolda gerekiyor ve iki kopya zamanla birbirinden
 * ayrılırdı.
 */
export function groupByCourse(courses: PublicCourse[]): CourseGroup[] {
    const grouped = new Map<string, PublicCourse[]>();

    for (const course of courses) {
        const existing = grouped.get(course.course);
        if (existing) {
            existing.push(course);
        } else {
            grouped.set(course.course, [course]);
        }
    }

    return [...grouped.entries()].map(([course, entries]) => ({ course, entries }));
}
