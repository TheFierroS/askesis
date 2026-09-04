"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import GenerationLoader from "./GenerationLoader";

/**
 * İstemci tarafı oturum nöbetçisi.
 *
 * Middleware sunucu tarafında kapıyı tutuyor — asıl koruma orası. Buradaki
 * katman iki boşluğu kapatıyor:
 *
 * 1. İstemci tarafı gezinme. Kullanıcı zaten sayfadayken başka bir sekmede
 *    çıkış yaparsa ya da oturumu sona ererse, middleware yeniden çalışmıyor
 *    (yeni bir sayfa isteği yok). Bu bileşen oturumun düştüğünü görüp ana
 *    sayfaya atıyor.
 *
 * 2. Geri/ileri gezinme. Tarayıcı sayfayı bellekten geri yüklediğinde React
 *    kodu yeniden çalışmıyor, ekran donmuş haliyle geliyor. `pageshow`
 *    olayının `persisted` alanı bu durumu bildiriyor; sayfayı yeniden
 *    yüklüyoruz ki middleware devreye girsin.
 *
 * Neden üç katman?
 * Middleware tek başına yeterli görünüyor ama yalnızca sayfa istekleri
 * sırasında çalışıyor. Tek katmana güvenmek, o katmanın çalışmadığı her anı
 * açık bırakmak demek.
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
    const { isLoaded, isSignedIn } = useAuth();
    const router = useRouter();

    useEffect(() => {
        // isLoaded beklenmeli: Clerk oturumu çözerken isSignedIn kısa süre
        // false oluyor, o anda yönlendirirsek giriş yapmış kullanıcıyı da
        // dışarı atarız.
        if (isLoaded && !isSignedIn) {
            router.replace("/");
        }
    }, [isLoaded, isSignedIn, router]);

    useEffect(() => {
        const onPageShow = (event: PageTransitionEvent) => {
            if (event.persisted) {
                // Sayfa bfcache'ten geri geldi: durum bayat olabilir.
                window.location.reload();
            }
        };

        window.addEventListener("pageshow", onPageShow);
        return () => window.removeEventListener("pageshow", onPageShow);
    }, []);

    // Oturum çözülene kadar içeriği çizmiyoruz. Çizersek, çıkış yapmış bir
    // kullanıcı yönlendirme gerçekleşene kadar bir an panoyu görüyor.
    if (!isLoaded) {
        return (
            <div
                className="min-h-screen flex items-center justify-center"
                style={{ backgroundColor: "var(--bg)" }}
            >
                <GenerationLoader
                    label="checking"
                    words={["session", "account", "access", "profile", "session"]}
                />
            </div>
        );
    }

    if (!isSignedIn) {
        // Yönlendirme yukarıdaki effect'te; burada boş dönüyoruz ki bir kare
        // bile korumalı içerik görünmesin.
        return null;
    }

    return <>{children}</>;
}