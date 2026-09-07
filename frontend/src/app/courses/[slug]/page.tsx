import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import CourseSamples from "../../../components/CourseSamples";
import Logo from "../../../components/Logo";
import Reveal from "../../../components/Reveal";
import ThemeSwitch from "../../../components/ThemeSwitch";
import TopicBars from "../../../components/TopicBars";
import { BRAND } from "../../../lib/brand";
import { fetchPublicCourse, fetchPublicCourses } from "../../../lib/publicApi";

/**
 * Bir dersin herkese açık sayfası.
 *
 * Sunucu bileşeni: "use client" YOK. İçerik sunucuda oluşup ilk HTML'e
 * yazılıyor, arama motoru JavaScript çalıştırmadan görüyor. Ana sayfada bu
 * dersi zor yoldan öğrendik — orada içerik bir zamanlayıcının arkasındaydı ve
 * ham HTML boş kalıyordu.
 *
 * Animasyon ve gezinme gerektiren parçalar ayrı istemci bileşenlerinde
 * (Reveal, TopicBars, CourseSamples). Sunucu bileşeninin içinde istemci
 * bileşeni kullanmak sorun değil; önemli olan sayfanın kendisinin sunucuda
 * oluşması.
 *
 * Adres ders + sınav türü: /courses/linear-algebra-midterm. Vize ve final
 * ayrı sayfalar çünkü farklı konuları ölçüyorlar ve farklı aramalarla
 * bulunuyorlar; tek sayfada sekme yapsaydık ikisi tek adres olarak yarışırdı.
 */

export async function generateStaticParams() {
    const courses = await fetchPublicCourses();
    return courses.map((course) => ({ slug: course.slug }));
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}): Promise<Metadata> {
    const { slug } = await params;
    const course = await fetchPublicCourse(slug);

    if (!course) return { title: `Course not found | ${BRAND.name}` };

    const title = `${course.course} ${course.exam_type} Practice Questions`;
    const description =
        `${course.question_count} practice questions for ${course.course}, ` +
        `written from real ${course.exam_type.toLowerCase()} papers. ` +
        `See which topics come up and try five for free.`;

    return {
        title: `${title} | ${BRAND.name}`,
        description,
        alternates: { canonical: `/courses/${slug}` },
        openGraph: { title, description, url: `/courses/${slug}`, type: "article" },
    };
}

export default async function CoursePage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const course = await fetchPublicCourse(slug);

    if (!course) notFound();

    // Backend eski bir sürümdeyse ya da Next.js önbelleğinde eski bir yanıt
    // kaldıysa bu alanlar eksik gelebiliyor. Sayfanın çökmesindense o bölümün
    // boş görünmesi iyi — nitekim slug yapısını değiştirdiğimizde önbellekteki
    // eski yanıt "siblings" alanı olmadan geldi ve sayfa patladı.
    const topics = course.topics ?? [];
    const samples = course.samples ?? [];
    const siblings = course.siblings ?? [];

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

            <div className="mx-auto max-w-3xl flex flex-col gap-20">
                <header className="flex flex-col gap-4">
                    <Reveal mode="mount" delay={0.05}>
                        <Link
                            href="/courses"
                            className="text-sm w-fit block"
                            style={{
                                color: "var(--fg-faint)",
                                fontFamily: "var(--font-display)",
                            }}
                        >
                            ← All courses
                        </Link>
                    </Reveal>

                    <Reveal mode="mount" delay={0.12} y={14}>
                        <h1
                            className="text-[clamp(1.75rem,4.5vw,2.75rem)] leading-[1.15]"
                            style={{ fontFamily: "var(--font-heading)", fontWeight: 400 }}
                        >
                            {course.course} {course.exam_type} Practice Questions
                        </h1>
                    </Reveal>

                    {/* Sınav türü geçişi. Tek tür varsa gösterilmiyor — tek
                        seçenekli bir seçici gürültüden ibaret. Final
                        yüklendiğinde kendiliğinden beliriyor. */}
                    {siblings.length > 1 && (
                        <Reveal mode="mount" delay={0.2}>
                            <nav className="flex items-center gap-2 mt-1">
                                {siblings.map((sibling) => {
                                    const active = sibling.slug === course.slug;
                                    return (
                                        <Link
                                            key={sibling.slug}
                                            href={`/courses/${sibling.slug}`}
                                            aria-current={active ? "page" : undefined}
                                            className="rounded-full border px-4 py-1.5 text-sm transition-colors"
                                            style={{
                                                borderColor: active
                                                    ? "var(--accent)"
                                                    : "var(--border)",
                                                color: active ? "var(--accent)" : "var(--fg-muted)",
                                                backgroundColor: active
                                                    ? "color-mix(in srgb, var(--accent) 10%, transparent)"
                                                    : "transparent",
                                                fontFamily: "var(--font-display)",
                                            }}
                                        >
                                            {sibling.exam_type}
                                        </Link>
                                    );
                                })}
                            </nav>
                        </Reveal>
                    )}

                    <Reveal mode="mount" delay={0.26}>
                        <p
                            className="text-sm leading-relaxed max-w-[52ch]"
                            style={{
                                color: "var(--fg-muted)",
                                fontFamily: "var(--font-geist-sans)",
                            }}
                        >
                            {course.question_count} questions are ready for this course,
                            written from real past papers and checked by a second,
                            independent model before they reach you. Below are the topics
                            that keep coming up, and five questions you can try right now.
                        </p>
                    </Reveal>
                </header>

                <section className="flex flex-col gap-7">
                    <Reveal>
                        <h2
                            className="text-2xl sm:text-3xl"
                            style={{
                                color: "var(--accent-2)",
                                fontFamily: "var(--font-heading)",
                                fontWeight: 400,
                            }}
                        >
                            What the exam asks
                        </h2>
                    </Reveal>

                    <TopicBars
                        topics={topics}
                        totalQuestions={course.question_count}
                    />
                </section>

                <section className="flex flex-col gap-7">
                    <Reveal>
                        <h2
                            className="text-2xl sm:text-3xl"
                            style={{
                                color: "var(--accent-3)",
                                fontFamily: "var(--font-heading)",
                                fontWeight: 400,
                            }}
                        >
                            Five questions from the pool
                        </h2>
                    </Reveal>

                    <Reveal delay={0.1} y={20}>
                        <CourseSamples samples={samples} />
                    </Reveal>
                </section>

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
                            Generate your own set from these papers
                        </h2>
                        <p
                            className="text-sm max-w-[44ch]"
                            style={{
                                color: "var(--fg-muted)",
                                fontFamily: "var(--font-geist-sans)",
                            }}
                        >
                            Choose how many questions you want, get a fresh set with worked
                            solutions, and print it as a proper exam sheet.
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