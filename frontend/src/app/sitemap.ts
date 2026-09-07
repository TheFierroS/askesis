import type { MetadataRoute } from "next";

/**
 * Şu an tek sayfa var. İçerik sayfaları eklendikçe buraya da eklenecek.
 */
export default function sitemap(): MetadataRoute.Sitemap {
    return [
        {
            url: "https://askesisapp.net",
            lastModified: new Date(),
            changeFrequency: "weekly",
            priority: 1,
        },
    ];
}