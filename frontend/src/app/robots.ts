import type { MetadataRoute } from "next";

/**
 * Arama motorlarına neyi tarayabileceğini söyler.
 *
 * /dashboard ve /admin kapalı: ikisi de giriş gerektiriyor, bot oraya
 * gittiğinde boş bir kabuk görüp onu indeksleyebilir. Middleware zaten
 * yönlendiriyor ama botun oraya hiç uğramaması daha temiz.
 */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: "/",
            disallow: ["/dashboard", "/admin"],
        },
        sitemap: "https://askesisapp.net/sitemap.xml",
    };
}