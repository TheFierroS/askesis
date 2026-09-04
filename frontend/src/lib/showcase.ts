/**
 * Hero'daki hareketli görsel duvarının içeriği.
 *
 * Görseller `public/showcase/` klasöründe duruyor. Yol her zaman `/showcase/`
 * ile başlıyor: Next.js `public` klasörünü sitenin köküne açıyor, yani
 * `public/showcase/1.png` dosyasına `/showcase/1.png` adresinden erişiliyor.
 *
 * Duvar 15 kare çiziyor, burada 8 görsel var — DriftWall listeyi başa sarıp
 * tekrar ediyor. Aynı kare iki kez görünüyor ama her sütun farklı hızda
 * aktığı için göze çarpmıyor.
 *
 * DOSYA UZANTISI
 * Aşağıdaki satırlar .png varsayıyor. Görsellerin .jpg ya da .webp ise
 * uzantıları değiştir; ad ve uzantı diskteki dosyayla BİREBİR aynı olmalı,
 * büyük-küçük harf dahil (sunucu Linux'ta çalışacak ve orada `1.PNG` ile
 * `1.png` farklı dosyalar).
 *
 * YENİ GÖRSEL EKLEMEK
 * Dosyayı public/showcase/ içine koy, listeye bir satır ekle. Sıra önemli
 * değil, duvar zaten karıştırıyor.
 *
 * BOYUT
 * Yaklaşık 600×400 (3:2) yeterli. Duvar zaten küçültüp karartıyor; büyük
 * dosyalar sayfanın ilk açılışını yavaşlatmaktan başka bir şey yapmıyor.
 * 200 KB üstündeki görselleri sıkıştırmakta fayda var.
 */

export interface ShowcaseTile {
    image: string;
    /** Erişilebilirlik için alt metni; ekranda görünmüyor. */
    title: string;
}

export const SHOWCASE_TILES: ShowcaseTile[] = [
    { image: "/showcase/1.jpg", title: "Studying from past papers" },
    { image: "/showcase/2.jpg", title: "A stack of past exam papers" },
    { image: "/showcase/3.jpg", title: "Notation turning into new questions" },
    { image: "/showcase/4.jpg", title: "An empty lecture hall" },
    { image: "/showcase/5.jpg", title: "Drafting instruments" },
    { image: "/showcase/6.jpg", title: "Library shelves" },
    { image: "/showcase/7.jpg", title: "An old manuscript page" },
    { image: "/showcase/8.jpg", title: "Topics weighted by how often they appear" },
];