"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

/**
 * Soru ve çözüm metinlerini çizer.
 *
 * Gelen metin Markdown + LaTeX karışımı: "(a) Compute $\\det(B)$." ya da
 * "$$\\begin{bmatrix}...\\end{bmatrix}$$". remark-math sınırlayıcıları buluyor,
 * rehype-katex çiziyor.
 *
 * Metin çizilmeden önce dört aşamadan geçiyor. Hepsi modelin ürettiği ya da
 * havuzda birikmiş gerçek hataları düzeltmek için; sıraları önemli.
 */

// ------------------------------------------------------- 0. metin temizliği

/**
 * Soru metnindeki görsel etiketlerini ve "Figure:" başlıklarını temizler.
 *
 * Şekil metinden AYRI geliyor (kartta metnin üstünde, PDF'te sorunun üstünde).
 * Model bazen metnin içine ayrıca `![Figure](figure.png)` gibi bir Markdown
 * görseli ya da yalnız başına "Figure:" satırı koyuyor. İlki kırık resim
 * simgesi olarak çiziliyor, ikincisi altında hiçbir şey olmayan bir başlık
 * bırakıyor.
 *
 * Prompt'ta da yasaklı ama havuzda böyle üretilmiş sorular birikti; onları
 * yeniden üretmek yerine burada süpürüyoruz.
 */
function stripFigurePlaceholders(text: string): string {
    return (
        text
            // ![alt](src) — Markdown görseli
            .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
            // Satır sonundaki yalnız "Figure:" / "Diagram:" başlığı
            .replace(/^\s*(figure|diagram|şekil)\s*:?\s*$/gim, "")
            // Metnin sonunda kalan "Figure:" kuyruğu
            .replace(/\n\s*(figure|diagram|şekil)\s*:\s*$/i, "")
            // Temizlikten kalan üçlü boş satırları ikiye indir
            .replace(/\n{3,}/g, "\n\n")
            .trim()
    );
}

// ---------------------------------------------------------------- 1. onarım

const DISPLAY_ENVS =
    "array|aligned|cases|split|gathered|matrix|bmatrix|pmatrix|vmatrix";

/**
 * Dengesiz sınırlayıcıları onarır.
 *
 * Model bazen blok ortamını tek dolar içine koyuyor ($\\begin{array}...$) ya da
 * bir ucunu tek diğerini çift bırakıyor. KaTeX ikisini de çizemiyor ve dolar
 * eşleşmesi kaydığı için sonraki sağlam formüller de bozuluyor.
 *
 * Açılış ve kapanış BİRLİKTE değiştiriliyor; ayrı ayrı ele almak dengesiz
 * ifade üretip durumu kötüleştiriyor.
 */
function repairDelimiters(text: string): string {
    const env = `(?:${DISPLAY_ENVS})`;
    const body = `[^$]*\\\\begin\\{${env}\\}[\\s\\S]*?\\\\end\\{${env}\\}[^$]*`;

    return (
        text
            // $...$ içinde blok ortamı → $$...$$
            .replace(new RegExp(`(?<!\\$)\\$(${body})\\$(?!\\$)`, "g"), "$$$$$1$$$$")
            // tek dolarla açılıp çift dolarla kapanan eski kayıtlar
            .replace(new RegExp(`(?<!\\$)\\$(${body})\\$\\$`, "g"), "$$$$$1$$$$")
            // üç ve fazlası hiçbir zaman geçerli değil
            .replace(/\${3,}/g, "$$$$")
    );
}

// ------------------------------------------- 2. uzun boylu matematiği taşı

/**
 * Satır yüksekliğini aşan yapılar.
 *
 * \\sqrt tek başına kısa kalıyor; köklü kesirler zaten \\frac üzerinden
 * yakalanıyor.
 *
 * \\lim listede DEĞİL: alt indisiyle birlikte satır yüksekliğinin bir buçuk
 * katı kadar ve mevcut satır aralığına sığıyor. Onu da taşımak
 * "(b) Evaluate" gibi yarım cümleleri satırda yalnız bırakıyordu.
 */
const TALL_MATH = /\\(frac|dfrac|cfrac|int|iint|oint|sum|prod|binom|begin)/;

/**
 * Satır içinde yazılmış uzun boylu matematiği kendi satırına taşır.
 *
 * ASIL DÜZELTME BURASI.
 *
 * CSS'te satır içi bir kutunun satır yüksekliğine katkısı line-height'tır,
 * içeriğinin gerçek boyu değil. Kesir ne kadar uzun olursa olsun satır
 * kutusunu büyütmüyor, taşıp komşu satıra giriyor. line-height artırmak ya da
 * inline-block vermek bazı durumlarda kurtarıyor, hepsinde değil — kart
 * genişliğine ve formülün boyuna göre değişiyor, bu yüzden "bir soruda düzgün,
 * diğerinde bozuk" görünüyordu.
 *
 * Kalıcı çözüm sorunu kaynağında kesmek: kesir, integral, toplam ve limit
 * basılı bir sınav kağıdında da kendi satırında durur. Prompt bunu modelden
 * istiyor; bu aşama havuzdaki eski soruları ve modelin atladığı durumları
 * topluyor.
 *
 * Kısa semboller ($x$, $f(x)$, $\\theta$, $\\det(A)$) satır içinde kalıyor:
 * onlar cümlenin akışının parçası, satıra çıkarmak metni parçalar.
 */
function liftTallInlineMath(text: string): string {
    // (?<!\$)\$...\$(?!\$) → yalnızca TEK dolarla sınırlanmış ifadeler.
    // [^$\n]+ → tek satırlık, içinde başka dolar bulunmayan satır içi matematik.
    // ([.,;:]?) → ifadenin hemen ardından gelen noktalama da yutuluyor.
    // Taşınan bir denklemin ardındaki tek nokta kendi satırında yalnız kalıyor
    // ve dizgi hatası gibi duruyordu; cümleyi bitiren denklemden sonra
    // noktaya gerek yok, basılı kitaplarda da çoğu zaman konmuyor.
    return text.replace(
        /(?<!\$)\$([^$\n]+)\$([.,;:]?)(?!\$)/g,
        (match, inner: string) =>
            TALL_MATH.test(inner) ? `\n\n$$${inner.trim()}$$\n\n` : match,
    );
}

// ------------------------------------------- 3. blok matematiği satırına al

/**
 * Blok matematiği kendi satırına, etrafında boş satırla yerleştirir.
 *
 * Markdown'da TEK satır sonu paragrafı bölmez. Model soruyu şöyle yazıyor:
 *
 *     Consider the function:
 *     $$f(x) = \frac{x^2-9}{x^2-7x+12}$$
 *     (a) Find the asymptotes.
 *
 * Üç satır arasında tek `\n` var, dolayısıyla hepsi TEK paragraf. remark-math
 * paragrafın ortasındaki `$$...$$` ifadesini blok değil SATIR İÇİ matematik
 * sayıyor; kesir satır yüksekliğini aşıyor ve komşu satıra biniyor.
 *
 * Blok sayılması için sınırlayıcıların etrafında BOŞ SATIR olmalı. İçeriği tek
 * satır bile olsa ayırıyoruz — eski sürüm yalnızca çok satırlı içeriği
 * ayırdığı için bu durumu kaçırıyordu.
 */
function normalizeDisplayMath(text: string): string {
    return text.replace(
        /\$\$([\s\S]*?)\$\$/g,
        (_match, content: string) => `\n\n$$\n${content.trim()}\n$$\n\n`,
    );
}

/**
 * Tek satır sonlarını gerçek satır kırılmasına çevirir.
 *
 * Aynı Markdown kuralının ikinci sonucu: "(a) ..." ve "(b) ..." ayrı satırlara
 * yazılmış olsa da tek paragrafta birleşip yan yana çıkıyordu. Markdown'da
 * satır kırmak için satır sonundan önce iki boşluk gerekiyor.
 *
 * Matematik bloklarının içine dokunmuyoruz: oradaki satır sonları LaTeX'in
 * kendi sözdiziminin parçası.
 */
function hardBreaks(text: string): string {
    // $$...$$ bloklarını ayırıp yalnızca aralarındaki düz metni işliyoruz.
    return text
        .split(/(\$\$[\s\S]*?\$\$)/g)
        .map((segment) => {
            if (segment.startsWith("$$")) return segment;
            // Çift satır sonu paragraf demek, ona dokunma; tek olanı kır.
            return segment.replace(/([^\n])\n(?!\n)/g, "$1  \n");
        })
        .join("");
}

// ----------------------------------------------------------- 4. genişliğe sığdır

/** Bunun altında formül okunmaz hale geliyor; oradan sonrası kaydırma. */
const MIN_FONT_SCALE = 0.65;

/**
 * Karta sığmayan blok formülleri küçülterek yerleştirir.
 *
 * Küçültme `transform: scale()` ile DEĞİL yazı boyutuyla yapılıyor.
 * transform elemanın yerleşim kutusunu küçültmüyor: görsel olarak küçülüyor
 * ama kapladığı yer aynı kalıyor. Bu yüzden yüksekliği elle hesaplamak
 * gerekiyordu ve yanlış hesap alttaki metnin üstüne binmeye yol açıyordu.
 * Yazı boyutu değişince yerleşim kendiliğinden yeniden akıyor, elle hesap yok.
 */
function fitDisplayMath(root: HTMLElement): void {
    const blocks = root.querySelectorAll<HTMLElement>(".katex-display");

    blocks.forEach((block) => {
        const inner = block.firstElementChild as HTMLElement | null;
        if (!inner) return;

        // Her ölçümden önce sıfırla: yoksa küçültmeler üst üste binip formülü
        // kademeli olarak yok eder.
        inner.style.fontSize = "";
        block.style.overflowX = "hidden";

        const available = block.clientWidth;
        if (available === 0) return;

        const needed = inner.scrollWidth;
        if (needed <= available) return;

        const scale = available / needed;

        if (scale >= MIN_FONT_SCALE) {
            // %2 pay: ölçüm ile çizim arasındaki yuvarlama farkı taşma
            // yaratmasın.
            inner.style.fontSize = `${Math.floor(scale * 98)}%`;
        } else {
            // Okunmayacak kadar küçülmesi gerekiyor: kaydırmaya izin ver.
            block.style.overflowX = "auto";
        }
    });
}

// ------------------------------------------------------------------ KaTeX

const KATEX_OPTIONS = {
    // Tek bozuk formül bütün sayfayı çökertmesin.
    throwOnError: false,
    // Varsayılan hata rengi parlak kırmızı; soluk ton bozuk formülü belli eder
    // ama ekranı bağırtmaz.
    errorColor: "var(--fg-faint)",
    // Bilinmeyen komutlarda konsolu uyarıyla doldurmasın.
    strict: false as const,
};

export default function MathMarkdown({
    children,
    className = "",
}: {
    children: string;
    className?: string;
}) {
    const content = useMemo(() => {
        const raw = children ?? "";
        return hardBreaks(
            normalizeDisplayMath(
                liftTallInlineMath(repairDelimiters(stripFigurePlaceholders(raw))),
            ),
        );
    }, [children]);

    const containerRef = useRef<HTMLDivElement>(null);

    const fit = useCallback(() => {
        if (containerRef.current) fitDisplayMath(containerRef.current);
    }, []);

    useEffect(() => {
        // KaTeX çizimini bitirdikten sonra ölçüyoruz.
        const frame = requestAnimationFrame(fit);

        // Kart genişliği değişince (pencere boyutu, kenar çubuğu) yeniden ölç.
        const observer = new ResizeObserver(fit);
        if (containerRef.current) observer.observe(containerRef.current);

        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, [content, fit]);

    return (
        <div ref={containerRef} className={`math-markdown ${className}`}>
            <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[[rehypeKatex, KATEX_OPTIONS]]}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}