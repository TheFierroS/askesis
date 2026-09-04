import type { Metadata } from "next";
import { Geist_Mono, Marcellus, Spectral } from "next/font/google";
import Providers from "./providers";
import { themeInitScript } from "../components/ThemeProvider";
import { BRAND } from "../lib/brand";
import "./globals.css";

/**
 * Tipografi üç katman:
 *
 *   --font-heading   Raventhorn  → büyük başlıklar (globals.css'te @font-face)
 *   --font-display   Marcellus   → arayüz etiketleri, butonlar, küçük başlıklar
 *   --font-geist-sans Spectral   → düz metin, sorular, çözümler
 *
 * Playfair Display buradaydı ve Raventhorn'un yanında düz kalıyordu. Marcellus
 * Roma yazıtlarından türemiş bir serif: süslü değil ama karakterli, 12 puntoda
 * bile okunuyor. Süslü fontları küçük metinde kullanmak okunabilirliği
 * bitiriyor, o iş Raventhorn'da kalıyor.
 *
 * Gövde metni serif (Spectral) çünkü KaTeX formülleri zaten serif çiziyor;
 * sans gövdeyle formüller yabancı duruyordu. Değişken adı --font-geist-sans
 * olarak kaldı: onlarca dosyada geçiyor, yeniden adlandırmanın getirisi yok.
 */

const marcellus = Marcellus({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

const spectral = Spectral({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Marka adı tek yerden geliyor: lib/brand.ts
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description:
    "Turn real past exam papers from your department into fresh practice " +
    "questions, matched to your course and exam type.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: data-theme'i script client'ta değiştiriyor,
    // React'in html attribute uyuşmazlığı uyarısını susturuyoruz.
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${spectral.variable} ${geistMono.variable} ${marcellus.variable} h-full antialiased`}
    >
      <head>
        {/* Hydration'dan önce çalışır — tema yanıp sönmesini (flash) engeller */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}