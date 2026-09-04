import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Korumalı rotalar.
 *
 * Önceki hali yalnızca `clerkMiddleware()` çağırıyordu — bu Clerk'i çalıştırıp
 * oturum bilgisini kullanılabilir yapıyor ama HİÇBİR ŞEYİ korumuyor.
 * /dashboard adresine giriş yapmadan gidildiğinde sayfa açılıyor, sadece API
 * çağrıları 401 dönüyordu. Yani veri sızmıyordu ama uygulama açık görünüyordu:
 * hem kafa karıştırıcı hem de sonraki bir hatanın gerçek açığa dönüşmesi için
 * uygun zemin.
 */
const PROTECTED_PREFIXES = ["/dashboard", "/admin"];

/**
 * Clerk'in createRouteMatcher yardımcısı kullanımdan kaldırıldı; yerine düz
 * yol kontrolü. Kalıp basit olduğu için glob desteğine ihtiyacımız yok, üstelik
 * ne olup bittiği okurken daha net.
 */
function isProtectedRoute(pathname: string): boolean {
    return PROTECTED_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
}

export default clerkMiddleware(async (auth, request) => {
    if (!isProtectedRoute(request.nextUrl.pathname)) {
        return;
    }

    const { userId } = await auth();

    if (!userId) {
        // auth.protect() yerine açık yönlendirme: projede ayrı bir /sign-in
        // sayfası yok, giriş ana sayfadaki modaldan yapılıyor.
        const url = new URL("/", request.url);
        return NextResponse.redirect(url);
    }

    const response = NextResponse.next();

    /**
     * Cache-Control: no-store
     *
     * İki işi birden yapıyor:
     *
     * 1. Ara sunucular ve tarayıcı önbelleği oturum açmış HTML'i saklamasın.
     *
     * 2. Daha önemlisi, sayfayı bfcache dışında bırakıyor. Tarayıcılar geri/
     *    ileri gezinmede sayfayı bellekten aynen geri yüklüyor — çıkış yaptıktan
     *    sonra geri tuşuna basınca hâlâ giriş yapılmış görünen ekranın sebebi
     *    bu. no-store ile sayfa yeniden isteniyor, middleware tekrar çalışıyor
     *    ve oturum yoksa ana sayfaya atıyor.
     */
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    response.headers.set("Pragma", "no-cache");

    return response;
});

export const config = {
    matcher: [
        // Next.js iç dosyaları ve statik dosyalar hariç her şey
        "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
        // Clerk'in kendi proxy yolu
        "/__clerk/:path*",
        // API rotaları
        "/(api|trpc)(.*)",
    ],
};