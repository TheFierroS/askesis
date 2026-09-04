/**
 * Landing'de gösterilen örnek sorular.
 *
 * Hepsi gerçekten üretilmiş sorular — uydurma örnek koymuyoruz. "Bu gerçekten
 * çalışıyor mu" sorusuna verilebilecek en doğrudan cevap sistemin kendi
 * çıktısını göstermek.
 *
 * YENİ SORU EKLEMEK
 * Dashboard'da beğendiğin bir soru üret, sonra buraya bir nesne ekle:
 *
 *   {
 *     topic: "Eigenvalues",        // karttaki konu etiketi
 *     difficulty: "medium",
 *     course: "Linear Algebra",
 *     prompt: `...soru metni...`,
 *     note: "Written from a 2023 midterm...",   // kartın altındaki cümle
 *   }
 *
 * Soru metnini olduğu gibi kopyala: `$...$` ve `$$...$$` sınırlayıcıları
 * korunmalı, KaTeX onları çiziyor. Ters bölüleri ikiye katlamana gerek yok —
 * backtick (`) ile yazılan şablon dizgesinde tek ters bölü yeterli DEĞİL,
 * çift yazılmalı; aşağıdaki örneklerde göreceğin gibi.
 */

export interface SampleQuestion {
    topic: string;
    difficulty: "easy" | "medium" | "hard";
    course: string;
    prompt: string;
    note: string;
}

export const SAMPLE_QUESTIONS: SampleQuestion[] = [
    {
        topic: "Determinants and inverse",
        difficulty: "medium",
        course: "Linear Algebra",
        prompt: `Let $$B = \\begin{bmatrix} 2 & -1 & 4 \\\\ 5 & 0 & 3 \\\\ 1 & 2 & -6 \\end{bmatrix}$$

(a) Calculate $\\det(B)$.
(b) Determine whether $B$ is invertible. If it is, compute $B^{-1}$.`,
        note: "Written from a 2024 midterm that asked the same thing with different numbers.",
    },
    {
        topic: "System consistency",
        difficulty: "hard",
        course: "Linear Algebra",
        prompt: `Consider the system of linear equations:

$$\\begin{cases} 2x_1 + 4x_2 - 2x_3 + x_4 = 1 \\\\ x_1 + 2x_2 - x_3 + 0x_4 = -1 \\\\ 3x_1 + 6x_2 - 3x_3 + 2x_4 = 3 \\end{cases}$$

(a) Is the system consistent?
(b) If yes, find the solution set in $\\mathbb{R}^4$.`,
        note: "The reference paper asked the same with five unknowns and a different right-hand side.",
    },
    {
        topic: "Change of basis",
        difficulty: "hard",
        course: "Linear Algebra",
        prompt: `Let $V = \\mathbb{P}_1$ and $\\mathcal{C}_1 = \\{1 + 2x,\\ 1 + x\\}$, $\\mathcal{C}_2 = \\{2,\\ 1 + 3x\\}$ be two ordered bases.

(a) Find the transition matrix from $\\mathcal{C}_1$ to $\\mathcal{C}_2$, i.e. $[I]_{\\mathcal{C}_1}^{\\mathcal{C}_2}$.
(b) Let $q(x) = 1 + x$. Find $[q(x)]_{\\mathcal{C}_1}$ and use the transition matrix to find $[q(x)]_{\\mathcal{C}_2}$.`,
        note: "Same structure as a 2024 question, on a smaller polynomial space.",
    },
];