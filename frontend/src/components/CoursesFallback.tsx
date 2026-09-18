"use client";

import { useEffect, useState } from "react";

import CourseSearch from "./CourseSearch";
import { groupByCourse } from "../lib/courseGroups";
import type { PublicCourse } from "../lib/publicApi";

/**
 * Sunucu listeyi alamadığında devreye giren yedek yol.
 *
 * Neden gerekiyor: Vercel'in sunucusu ile API arasındaki yol aralıklı olarak
 * kopuyor. Sunucu render'ı o ana denk geldiğinde boş liste üretiliyor ve —
 * kritik kısım — Next bunu başarılı bir render sanıp ÖNBELLEĞE YAZIYOR. Boş
 * sayfa, revalidate süresi dolana kadar herkese aynı şekilde servis ediliyor.
 * Ziyaretçi sert yenileme yapsa bile değişmiyor, çünkü yenilenen şey
 * tarayıcının kopyası, sunucunun önbelleği değil.
 *
 * Bu bileşen o kopmayı ziyaretçiden gizliyor: aynı adresi bu kez TARAYICIDAN
 * çağırıyor. Tarayıcı ile API arasındaki yol sağlam (aynı istek curl ile 0,13
 * saniye), dolayısıyla sunucu ulaşamasa bile liste ekrana geliyor.
 *
 * SEO'yu bozmuyor, çünkü yalnızca sunucu render'ı BAŞARISIZ olduğunda
 * basılıyor. Sunucu listeyi alabildiğinde sayfa eskisi gibi tam HTML olarak
 * üretiliyor ve bot her şeyi görüyor. Zaten başarısız render'da botun
 * göreceği alternatif boş bir sayfaydı.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

/** Tarayıcı tarafında da vazgeçme süresi olmalı; sekmeyi sonsuza kadar
 *  "yükleniyor" halinde bırakmak boş liste göstermekten kötü. */
const TIMEOUT_MS = 10000;

const EMPTY_MESSAGE = "No courses are ready just yet. Check back soon.";

type State =
    | { status: "loading" }
    | { status: "ready"; courses: PublicCourse[] }
    | { status: "failed" };

export default function CoursesFallback() {
    const [state, setState] = useState<State>({ status: "loading" });

    useEffect(() => {
        // AbortController iki iş yapıyor: zaman aşımı ve bileşen sökülürse
        // isteği iptal etmek. İkincisi olmadan React, sökülmüş bileşende
        // setState çağrısı uyarısı veriyor.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

        async function load() {
            try {
                const response = await fetch(`${BASE_URL}/public/courses`, {
                    signal: controller.signal,
                    // Tarayıcı önbelleği burada istenmiyor: bu yola zaten
                    // sunucu taze veriyi alamadığı için düşüldü.
                    cache: "no-store",
                });

                if (!response.ok) {
                    setState({ status: "failed" });
                    return;
                }

                const courses = (await response.json()) as PublicCourse[];
                setState({ status: "ready", courses });
            } catch {
                setState({ status: "failed" });
            } finally {
                clearTimeout(timer);
            }
        }

        void load();

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, []);

    if (state.status === "loading") {
        return (
            <p
                className="text-sm"
                style={{
                    color: "var(--fg-faint)",
                    fontFamily: "var(--font-geist-sans)",
                }}
            >
                Loading courses…
            </p>
        );
    }

    // Tarayıcı da ulaşamadıysa gerçekten söylenecek bir şey yok. Ziyaretçiye
    // teknik bir hata göstermenin faydası olmaz; eskisi gibi nötr mesaj.
    if (state.status === "failed" || state.courses.length === 0) {
        return (
            <p
                className="text-sm"
                style={{
                    color: "var(--fg-faint)",
                    fontFamily: "var(--font-geist-sans)",
                }}
            >
                {EMPTY_MESSAGE}
            </p>
        );
    }

    return <CourseSearch groups={groupByCourse(state.courses)} />;
}
