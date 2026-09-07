import type { Metadata } from "next";
import Link from "next/link";

import CourseSearch, { type CourseGroup } from "../../components/CourseSearch";
import Logo from "../../components/Logo";
import Reveal from "../../components/Reveal";
import ThemeSwitch from "../../components/ThemeSwitch";
import { BRAND } from "../../lib/brand";
import { fetchPublicCourses, type PublicCourse } from "../../lib/publicApi";

/**
 * Herkese açık ders dizini.
 *
 * İki işi var. Ziyaretçi için: hangi derslerin hazır olduğunu tek yerden
 * görmek. Arama motoru için daha önemlisi: ders sayfalarına giden bağlantılar
 * burada toplanıyor. Bot bir sayfayı ancak ona giden bir bağlantı varsa
 * keşfediyor; sitemap yardımcı oluyor ama tek başına yeterli sayılmıyor.
 *
 * Sunucu bileşeni. Arama kutusu ve animasyonlar ayrı istemci bileşenlerinde,
 * ama liste yine sunucuda basılıyor.
 */

const TITLE = "All courses";
const DESCRIPTION =
    "Every course with practice questions ready, built from real past " +
    "exam papers. Browse by course and exam type.";

export const metadata: Metadata = {
    title: `${TITLE} | ${BRAND.name}`,
    description: DESCRIPTION,
    alternates: { canonical: "/courses" },
    // openGraph AÇIKÇA yazılıyor. Next.js eksik alanları üst katmandan
    // devralıyor; yazmasaydık layout.tsx'teki og:url ("/") bu sayfaya da
    // yapışırdı ve paylaşılan link yanlış adresi gösterirdi.
    openGraph: {
        title: TITLE,
        description: DESCRIPTION,
        url: "/courses",
        type: "website",
    },
};

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
 */
function groupByCourse(courses: PublicCourse[]): CourseGroup[] {
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

export default async function CoursesPage() {
    const courses = await fetchPublicCourses();
    const groups = groupByCourse(courses);

    return (
        <main
            className="relative min-h-screen px-6 pt-24 pb-20"
            style={{ backgroundColor: "var(--bg)", color: "var(--fg)" }}
        >
            {/* Üst çubuk BİLEREK animasyonsuz.

                Reveal bir sarmalayıcı motion.div oluşturup ona transform
                uyguluyor. CSS'te transform uygulanmış bir ata, içindeki
                position:fixed elemanın referans noktasını değiştiriyor —
                sabit eleman pencereye değil o sarmalayıcıya göre konumlanıyor.
                Sonuç: çubuk animasyon boyunca sayfayla kayıp sonunda yerine
                oturuyordu. */}
            <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 pointer-events-none">
                <Link href="/" className="pointer-events-auto" aria-label="Askesis home">
                    <Logo size={30} />
                </Link>
                <span className="pointer-events-auto">
                    <ThemeSwitch />
                </span>
            </div>

            <div className="mx-auto max-w-3xl flex flex-col gap-14">
                <header className="flex flex-col gap-4">
                    <Reveal mode="mount" delay={0.05}>
                        <Link
                            href="/"
                            className="text-sm w-fit block"
                            style={{
                                color: "var(--fg-faint)",
                                fontFamily: "var(--font-display)",
                            }}
                        >
                            ← Home
                        </Link>
                    </Reveal>

                    <Reveal mode="mount" delay={0.12} y={14}>
                        <h1
                            className="text-[clamp(1.75rem,4.5vw,2.75rem)] leading-[1.15]"
                            style={{ fontFamily: "var(--font-heading)", fontWeight: 400 }}
                        >
                            Courses with questions ready
                        </h1>
                    </Reveal>

                    <Reveal mode="mount" delay={0.2}>
                        <p
                            className="text-sm leading-relaxed max-w-[52ch]"
                            style={{
                                color: "var(--fg-muted)",
                                fontFamily: "var(--font-geist-sans)",
                            }}
                        >
                            Each of these has a pool built from real past papers. Open one
                            to see which topics keep coming up and try five questions for
                            free.
                        </p>
                    </Reveal>
                </header>

                {groups.length === 0 ? (
                    /* Boş liste iki durumda görünüyor: hiçbir dersin havuzu henüz
                       eşiği geçmemiş, ya da backend'e ulaşılamıyor. İkisini
                       ziyaretçi açısından ayırmanın anlamı yok. */
                    <Reveal mode="mount" delay={0.28}>
                        <p
                            className="text-sm"
                            style={{
                                color: "var(--fg-faint)",
                                fontFamily: "var(--font-geist-sans)",
                            }}
                        >
                            No courses are ready just yet. Check back soon.
                        </p>
                    </Reveal>
                ) : (
                    <CourseSearch groups={groups} />
                )}

                <Reveal y={16}>
                    <section
                        className="flex flex-col items-center gap-5 text-center py-14 px-6 rounded-2xl border"
                        style={{
                            borderColor: "var(--border)",
                            backgroundColor: "var(--surface)",
                        }}
                    >
                        <h2
                            className="text-2xl sm:text-3xl max-w-md"
                            style={{ fontFamily: "var(--font-heading)", fontWeight: 400 }}
                        >
                            Your course is not here?
                        </h2>
                        <p
                            className="text-sm max-w-[44ch]"
                            style={{
                                color: "var(--fg-muted)",
                                fontFamily: "var(--font-geist-sans)",
                            }}
                        >
                            A course shows up here once enough past papers have been added
                            to it. Sign up to see the full catalogue and what is coming.
                        </p>
                        <Link href="/" className="btn-create-account">
                            Get Started
                            <div className="icon">
                                <svg
                                    height="24"
                                    width="24"
                                    viewBox="0 0 24 24"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path d="M0 0h24v24H0z" fill="none" />
                                    <path
                                        d="M16.172 11l-5.364-5.364 1.414-1.414L20 12l-7.778 7.778-1.414-1.414L16.172 13H4v-2z"
                                        fill="currentColor"
                                    />
                                </svg>
                            </div>
                        </Link>
                    </section>
                </Reveal>
            </div>
        </main>
    );
}