"use client";

import { useEffect, useMemo, useState } from "react";
import { SignUpButton, SignInButton, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import StrokeText from "../components/StrokeText";
import DriftWall from "../components/DriftWall";
import ScrollSteps from "../components/ScrollSteps";
import TiltCard from "../components/TiltCard";
import CursorGlow from "../components/CursorGlow";
import ThemeSwitch from "../components/ThemeSwitch";
import Logo from "../components/Logo";
import Faq from "../components/Faq";
import SampleQuestions from "../components/SampleQuestions";
import PricingCards from "../components/PricingCards";
import { FREE_CREDITS } from "../lib/pricing";
import {
  SceneFrequency,
  SceneReview,
  SceneRewrite,
  SceneSplit,
} from "../components/StepScenes";
import { BRAND } from "../lib/brand";
import { SHOWCASE_TILES } from "../lib/showcase";
import {
  DEPARTMENTS,
  GRADES,
  coursesFor,
} from "../lib/courseCatalog";
import { useThemeColors, accentAt } from "../components/themeColors";
import { useTheme } from "../components/ThemeProvider";

type Step = { key: string; title: string };

/**
 * Karşılama akışındaki üç adım.
 *
 * Seçenekler burada sabit DEĞİL: ders listesi seçilen bölüm ve sınıfa göre
 * değişiyor, o yüzden adım adım hesaplanıyor (stepOptions).
 */
const steps: Step[] = [
  { key: "department", title: "Choose Your Department" },
  { key: "grade", title: "Choose Your Grade" },
  { key: "course", title: "Choose Your Course" },
];

/**
 * Bir adımın seçenekleri, o ana kadar verilen cevaplara göre.
 *
 * Katalog tek kaynak: dashboard, admin ve burası aynı ders listesini
 * kullanıyor. Landing'de ayrı bir liste tutmak, müfredat güncellenince birinin
 * unutulması demekti.
 */
function stepOptions(index: number, answers: string[]): string[] {
  if (index === 0) return DEPARTMENTS;
  if (index === 1) return GRADES;
  return coursesFor(answers[0] ?? DEPARTMENTS[0], answers[1] ?? GRADES[0]);
}

type Stage = "intro" | "landing" | "steps" | "summary" | "signup";

const FAQ_ITEMS = [
  {
    question: "How is this different from asking ChatGPT for questions?",
    answer:
      "A general model invents questions from what it knows about a subject. It has never seen your department's exam. Melete starts from the actual papers your course has given, keeps the same question types and difficulty, and stays inside the topics those papers cover. If eigenvalues were never on your midterm, you will not be asked about eigenvalues.",
  },
  {
    question: "Can I trust that the questions are correct?",
    answer:
      "Every generated question is reviewed by a second, independent model before it reaches you: is it solvable, is anything missing, is the notation right. Questions that fail are discarded, not shown. That said, this is machine-generated practice material — if something looks wrong to you, trust your own reasoning and check with your instructor.",
  },
  {
    question: "Will I ever see the same question twice?",
    answer:
      "No. The site records which questions have been shown to you and never repeats one, even across different sessions. If you delete a set from your history, those questions still will not come back — deleting a set removes it from your list, it does not mark the questions as unseen.",
  },
  {
    question: "Why are the questions in English but the solutions in Turkish?",
    answer:
      "Because that is how your exam works. The paper is in English, so practising in English is the point. But the explanation is there to help you understand, and that lands better in Turkish. Technical terms carry the English word in brackets so you recognise them on exam day.",
  },
  {
    question: "My course is not listed. Can it be added?",
    answer:
      "A course appears only once at least one past paper has been uploaded for it, because there is nothing to generate from otherwise. Send us the papers you have and we will add the course.",
  },
  {
    question: "What does it cost?",
    answer:
      `Every account starts with ${FREE_CREDITS} free questions. After that you buy credits in packages, and a credit is one question — a three-question set costs three, not a whole exam. Credits do not expire, and solutions and PDF downloads are included at no extra cost.`,
  },
];

const BADGE_FONT_TOP = 56;
const BADGE_FONT_SUMMARY = 84;

const FONT_FAMILY = "var(--font-display)";

export default function Home() {
  // Renkler: CSS'e yazılabilenler var(--token), prop olarak geçenler (StrokeText,
  // DriftWall, SVG stroke attribute'ları, hex+alpha birleştirmeleri) burada.
  const c = useThemeColors();
  const { theme } = useTheme();
  const isLight = theme === "light";

  const [stage, setStage] = useState<Stage>("intro");
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showCta, setShowCta] = useState(false);
  const { isSignedIn } = useUser();
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => setStage("landing"), 3500);
    return () => clearTimeout(timer);
  }, []);
  /**
 * Intro sırasında sayfa kaydırmayı kilitler.
 *
 * Landing içeriği artık intro sırasında da DOM'da duruyor (arama motoru
 * boş bir sayfa görmesin diye). Kaplama onu örtüyor ama sayfa yine de
 * kaydırılabiliyordu: kullanıcı intro biterken ortada bir yerde uyanıyordu.
 */
  useEffect(() => {
    if (stage !== "intro") return;

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [stage]);

  const [prevStage, setPrevStage] = useState(stage);
  if (stage !== prevStage) {
    setPrevStage(stage);
    if (stage !== "summary") setShowCta(false);
  }

  useEffect(() => {
    if (stage === "summary") {
      const t = setTimeout(() => setShowCta(true), answers.length * 150 + 500);
      return () => clearTimeout(t);
    }
  }, [stage, answers.length]);

  useEffect(() => {
    if (isSignedIn) {
      router.push("/dashboard");
    }
  }, [isSignedIn, router]);

  const currentStep = steps[stepIndex];

  const filteredOptions = useMemo(() => {
    if (!currentStep) return [];
    const options = stepOptions(stepIndex, answers);
    if (!query.trim()) return options;
    return options.filter((o) =>
      o.toLowerCase().includes(query.trim().toLowerCase()),
    );
  }, [currentStep, stepIndex, answers, query]);

  const handleSelect = (option: string) => {
    setOpen(false);
    setQuery("");

    const nextAnswers = [...answers, option];
    setAnswers(nextAnswers);

    if (stepIndex + 1 < steps.length) {
      setStepIndex((i) => i + 1);
    } else {
      /**
       * Seçimleri dashboard'a taşıyoruz.
       *
       * Kullanıcı burada bölüm, sınıf ve ders seçiyor; kayıt olduktan sonra
       * dashboard'da aynı şeyleri baştan seçmek zorunda kalması gereksiz bir
       * tekrar. sessionStorage yeterli: bilgi tek oturumluk ve hassas değil,
       * sunucuya taşımaya değmez.
       */
      try {
        sessionStorage.setItem(
          "askesis:onboarding",
          JSON.stringify({
            department: nextAnswers[0],
            grade: nextAnswers[1],
            course: nextAnswers[2],
          }),
        );
      } catch {
        // Depolama kapalıysa sorun değil, dashboard varsayılanlarla açılır.
      }
      setTimeout(() => setStage("summary"), 900);
    }
  };

  const isSummary = stage === "summary" || stage === "signup";
  // Üç adım, üç renk: seçim ekranındaki başlık, buton ve seçenekler bunu izliyor
  const stepColor = accentAt(c, stepIndex);

  return (
    <main
      className="relative min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: "var(--bg)", color: "var(--fg)" }}
    >
      {/* Marka ve tema anahtarı — tek bir üst satırda.

          İkisini ayrı ayrı `fixed` konumlandırmak hizayı bozuyordu: logo
          büyüdükçe kendi kutusu yükseliyor, tema anahtarı sabit kalıyordu ve
          mobilde göze çarpacak kadar kayıyorlardı. Aynı satırın içinde
          `items-center` ile her boyutta hizalı duruyorlar.

          Intro ("Welcome..") sırasında ikisi de gizli: o an ekranda tek bir
          şeyin durması gerekiyor. */}
      <AnimatePresence>
        {stage !== "intro" && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 pointer-events-none"
          >
            {/* Kapsayıcı tıklamaları geçiriyor; yalnızca içindeki öğeler
                tıklanabilir. Aksi halde ekranın üstündeki şeffaf şerit
                altındaki içeriğe tıklamayı engelliyordu. */}
            <span className="pointer-events-auto">
              <Logo size={30} />
            </span>
            <span className="pointer-events-auto">
              <ThemeSwitch />
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Intro artık tam ekran bir kaplama.
          Önce içeriğin YERİNE çiziliyordu; landing bloğu DOM'a hiç girmediği
          için sayfanın ilk HTML'i boştu ve arama motoru "Welcome.." dışında
          bir şey görmüyordu. Kaplama olarak koyunca görüntü aynı kalıyor ama
          içerik baştan sayfada duruyor. */}
      <AnimatePresence>
        {stage === "intro" && (
          <motion.div
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="fixed inset-0 z-[100] flex items-center justify-center px-4"
            style={{ backgroundColor: "var(--bg)" }}
          >
            <StrokeText
              text="Welcome.."
              // Kontur ve dolgu her zaman aynı renk: önce çizgi çiziliyor,
              // sonra aynı renk içini dolduruyor.
              strokeColor={c.accent}
              fillColor={c.accent}
              fontFamily={FONT_FAMILY}
              strokeWidth={1.4}
              drawDuration={1.6}
              fillDelay={0.2}
              stagger={0.05}
              trigger="mount"
              fillMode="wipe"
              fontSize={128}
              fontWeight={800}
              letterSpacing={-2}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {(stage === "intro" || stage === "landing") && (
        <div className="relative w-full">
          <CursorGlow color={c.accent} />
          {/* ================= HERO ================= */}
          <div className="relative w-full h-[92vh] min-h-[600px] overflow-hidden">
            <div className="absolute inset-0">
              <DriftWall
                items={SHOWCASE_TILES}
                columns={6}
                tileWidth={180}
                tileHeight={120}
                gap={14}
                tilt={14}
                turn={-12}
                // turn=-12 açısı duvarı 3B'de döndürdüğü için görsel ağırlık
                // sağa kayıyor: solda fazla boşluk kalıyor, sağ kenar ekrana
                // yapışıyor. Negatif değer duvarı sola çekip dengeliyor.
                // Bu bir ayar düğmesi — gözüne oturana kadar -4 / -10 arasında oyna.
                offsetX={-6}
                perspective={1200}
                depth={100}
                speed={26}
                direction="up"
                variance={0.4}
                parallax={0.4}
                lift={56}
                fade={0.7}
                // Açık temada krem overlay fotoğrafları yıkıyordu: overlay
                // opaklığı düşürüldü, dim yükseltildi ve gri filtre kaldırıldı —
                // renk buradan da geliyor. Koyu temada mono duruş korunuyor.
                dim={isLight ? 0.92 : 0.62}
                overlayOpacity={isLight ? 0.1 : 0.32}
                grayscale={!isLight}
                // Hex yerine CSS değişkeni: DriftWall bunu --dw-overlay olarak
                // aktarıyor ve iç içe var() sorunsuz çözülüyor. JS'ten hex
                // verirsek tema değişiminde overlay ANINDA değişiyor, altındaki
                // bölüm ise 0.35s'de geçiyor — ikisi kopuyordu.
                overlayColor="var(--bg)"
                radius={14}
                pauseOnHover={true}
              />
            </div>

            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                // hex + alpha birleştirmesi — burada var() kullanılamaz
                // color-mix ile CSS değişkeni üzerinden: hex birleştirme
                // (${c.bg}CC) tema değişiminde anında sıçrıyordu.
                background: isLight
                  ? "linear-gradient(to bottom, transparent 0%, color-mix(in srgb, var(--bg) 70%, transparent) 74%, var(--bg) 100%)"
                  : "linear-gradient(to bottom, transparent 0%, color-mix(in srgb, var(--bg) 80%, transparent) 68%, var(--bg) 100%)",
              }}
            />

            <div className="absolute inset-0 flex flex-col items-center justify-end gap-10 pb-16 px-4 text-center pointer-events-none">
              <motion.div
                initial="hidden"
                // Intro bitmeden oynatma: içerik artık intro sırasında da
                // DOM'da, animasyon kullanıcı görmeden bitiyordu.
                animate={stage === "landing" ? "visible" : "hidden"}
                variants={{
                  hidden: {},
                  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
                }}
                className="flex flex-col items-center gap-3 max-w-xl"
              >
                <motion.p
                  variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="text-sm sm:text-base uppercase tracking-[0.28em]"
                  style={{ color: "var(--accent)", fontFamily: "var(--font-heading)" }}
                >
                  Built from real past exams
                </motion.p>

                <motion.h1
                  variants={{ hidden: { opacity: 0, y: 14, filter: "blur(6px)" }, visible: { opacity: 1, y: 0, filter: "blur(0px)" } }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="text-[clamp(1.75rem,4.5vw,2.75rem)] leading-[1.15]"
                  style={{
                    color: "var(--fg)",
                    // Büyük başlık: Raventhorn burada parlıyor.
                    fontFamily: "var(--font-heading)",
                    fontWeight: 400,
                  }}
                >
                  {BRAND.tagline}
                </motion.h1>

                <motion.p
                  variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="text-sm md:text-[15px] leading-relaxed max-w-[42ch] mt-1"
                  style={{ color: "var(--fg-muted)", fontFamily: "var(--font-geist-sans)" }}
                >
                  {BRAND.name} reads the exams your department actually gave,
                  question by question, and writes new ones in the same style,
                  on the same topics, at the same difficulty.
                </motion.p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={stage === "landing" ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
                transition={{ duration: 0.5, ease: "easeOut", delay: 0.55 }}
                className="flex flex-col items-center gap-4 pointer-events-auto"
              >
                <motion.button
                  whileHover={{ scale: 1.04, boxShadow: `0 12px 32px -8px ${c.accentGlow}` }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  onClick={() => setStage("steps")}
                  className="btn-create-account"
                >
                  Get Started
                  <div className="icon">
                    <svg height="24" width="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M0 0h24v24H0z" fill="none"></path>
                      <path
                        d="M16.172 11l-5.364-5.364 1.414-1.414L20 12l-7.778 7.778-1.414-1.414L16.172 13H4v-2z"
                        fill="currentColor"
                      ></path>
                    </svg>
                  </div>
                </motion.button>

                <div className="flex items-center gap-1.5 text-sm" style={{ color: "var(--fg-muted)", fontFamily: FONT_FAMILY }}>
                  <span>Already have an account?</span>
                  <SignInButton mode="modal" fallbackRedirectUrl="/dashboard">
                    <button className="cta-signin">
                      <span className="hover-underline-animation-signin">Sign In</span>
                      <svg id="arrow-horizontal" xmlns="http://www.w3.org/2000/svg" width="24" height="10" viewBox="0 0 46 16">
                        <path
                          id="Path_10"
                          data-name="Path 10"
                          d="M8,0,6.545,1.455l5.506,5.506H-30V9.039H12.052L6.545,14.545,8,16l8-8Z"
                          transform="translate(30)"
                        ></path>
                      </svg>
                    </button>
                  </SignInButton>
                </div>
              </motion.div>
            </div>

            {/* Kaydırma ipucu */}
            <motion.div
              className="absolute bottom-4 left-1/2 -translate-x-1/2"
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            >
              {/* stroke bir SVG attribute'u — var() kabul etmiyor, hex şart */}
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                style={{ color: "var(--accent-2)" }}
              >
                <path d="M12 4v16m0 0l-6-6m6 6l6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </motion.div>
          </div>

          {/* ================= NASIL ÇALIŞIR ================= */}
          <section className="w-full max-w-5xl mx-auto px-6 pt-32 pb-24 flex flex-col items-center gap-24">
            <motion.h2
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5 }}
              className="text-2xl sm:text-3xl"
              style={{ color: "var(--accent-2)", fontFamily: "var(--font-heading)" }}
            >
              How it works
            </motion.h2>

            <ScrollSteps
              color="var(--fg)"
              fontFamily={FONT_FAMILY}
              items={[
                {
                  step: "01",
                  title: "Real exams, taken apart",
                  description:
                    "Past papers from your department are read page by page and split into individual questions, then labelled by the concept each one tests.",
                  color: c.accent,
                  visual: <SceneSplit color={c.accent} />,
                  icon: (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="1.5">
                      <path d="M6 2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z M15 2v5h5 M9 13h6 M9 17h6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ),
                },
                {
                  step: "02",
                  title: "The pattern, measured",
                  description:
                    "A topic that shows up in every year's paper counts for more than one that appeared once. Your practice set reflects what the exam actually asks.",
                  color: c.accent2,
                  visual: <SceneFrequency color={c.accent2} />,
                  icon: (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c.accent2} strokeWidth="1.5">
                      <path d="M4 20V10 M10 20V4 M16 20v-7 M22 20H2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ),
                },
                {
                  step: "03",
                  title: "New questions, written",
                  description:
                    "Same concepts, same difficulty, different numbers. Close enough to be useful practice, different enough that you cannot memorise your way through.",
                  color: c.accent3,
                  visual: <SceneRewrite color={c.accent3} />,
                  icon: (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c.accent3} strokeWidth="1.5">
                      <path d="M12 3l1.9 4.3L18 9l-4.1 1.7L12 15l-1.9-4.3L6 9l4.1-1.7L12 3z M19 15l.8 1.9L22 18l-2.2.9L19 21l-.8-2.1L16 18l2.2-1.1L19 15z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ),
                },
                {
                  step: "04",
                  title: "Checked before you see them",
                  description:
                    "A second, independent model reviews every question for mathematical soundness and completeness. Anything doubtful is thrown away rather than shown to you.",
                  color: c.accent,
                  visual: <SceneReview color={c.accent} />,
                  icon: (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="1.5">
                      <path d="M9 11l3 3L22 4 M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ),
                },
              ]}
            />
          </section>

          {/* ================= ÖZELLİKLER ================= */}
          <section
            className="w-full py-24 px-6 flex flex-col items-center gap-16"
            style={{ backgroundColor: "var(--surface)" }}
          >
            <motion.h2
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5 }}
              className="text-2xl sm:text-3xl text-center max-w-xl"
              style={{ color: "var(--accent-3)", fontFamily: "var(--font-heading)" }}
            >
              What that means when you sit down to study
            </motion.h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-4xl">
              {[
                {
                  title: "Never the same question twice",
                  desc: "The site remembers what you have already seen. Every set is new to you.",
                },
                {
                  title: "Worked solutions in Turkish",
                  desc: "Questions stay in English, like your exam. The explanation is in Turkish, with the English term in brackets.",
                },
                {
                  title: "Print it like a real paper",
                  desc: "Download any set as a properly typeset exam sheet, with space to work.",
                },
                {
                  title: "Your sets are saved",
                  desc: "Come back to any exam you generated, or delete it for good.",
                },
              ].map((f, i) => {
                // Kartlar üçlü vurgu setinde sırayla dönüyor
                const fc = accentAt(c, i);
                // Aynı rengin CSS değişkeni karşılığı — tema geçişinde
                // animasyona girmesi için.
                const fcVar = ["var(--accent)", "var(--accent-2)", "var(--accent-3)"][
                  i % 3
                ];
                return (
                  <motion.div
                    key={f.title}
                    initial={{ opacity: 0, x: i % 2 === 0 ? -16 : 16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.5, delay: (i % 2) * 0.08, ease: "easeOut" }}
                  >
                    <TiltCard
                      className="flex items-start gap-4 rounded-2xl border border-l-4 px-5 py-5 h-full"
                      style={{
                        // color-mix: renk değişkenden geldiği için tema geçişinde
                        // kartlar da diğer her şeyle aynı anda dönüyor.
                        borderColor: `color-mix(in srgb, ${fcVar} 20%, transparent)`,
                        borderLeftColor: fcVar,
                        backgroundColor: `color-mix(in srgb, ${fcVar} 6%, transparent)`,
                      }}
                    >
                      <span
                        className="mt-1.5 h-2 w-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: fcVar }}
                      />
                      <div>
                        <h4
                          className="text-lg mb-1"
                          style={{
                            color: "var(--fg)",
                            fontFamily: "var(--font-heading)",
                            fontWeight: 400,
                          }}
                        >
                          {f.title}
                        </h4>
                        <p
                          className="text-sm leading-relaxed"
                          style={{ color: "var(--fg-muted)", fontFamily: "var(--font-geist-sans)" }}
                        >
                          {f.desc}
                        </p>
                      </div>
                    </TiltCard>
                  </motion.div>
                );
              })}
            </div>
          </section>

          {/* ================= ÖRNEK SORULAR ================= */}
          <section className="w-full max-w-4xl mx-auto px-6 py-24 flex flex-col items-center gap-8">
            <motion.h2
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5 }}
              className="text-2xl sm:text-3xl text-center"
              style={{ color: "var(--accent)", fontFamily: "var(--font-heading)" }}
            >
              Actual generated questions
            </motion.h2>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="w-full"
            >
              <SampleQuestions accentFor={(i) => accentAt(c, i)} />
            </motion.div>
          </section>

          {/* ================= FİYATLANDIRMA ================= */}
          <section className="w-full max-w-5xl mx-auto px-6 py-24 flex flex-col items-center gap-4">
            <motion.h2
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5 }}
              className="text-2xl sm:text-3xl"
              style={{ color: "var(--accent-3)", fontFamily: "var(--font-heading)" }}
            >
              Pricing
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: 0.08 }}
              className="text-sm text-center max-w-lg mb-6"
              style={{
                color: "var(--fg-muted)",
                fontFamily: "var(--font-geist-sans)",
              }}
            >
              Every new account starts with {FREE_CREDITS} questions, free. You
              only pay once you have seen what the questions look like — and you
              pay per question, not per exam, so a three-question set costs
              three.
            </motion.p>

            <PricingCards accentFor={(i) => accentAt(c, i)} />

            <p
              className="text-xs text-center mt-4"
              style={{ color: "var(--fg-faint)", fontFamily: FONT_FAMILY }}
            >
              Credits never expire. Solutions and PDF exports are included.
            </p>
          </section>

          {/* ================= SSS ================= */}
          <section
            className="w-full py-24 px-6 flex flex-col items-center gap-10"
            style={{ backgroundColor: "var(--surface)" }}
          >
            <motion.h2
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5 }}
              className="text-2xl sm:text-3xl"
              style={{ color: "var(--accent-2)", fontFamily: "var(--font-heading)" }}
            >
              Questions people ask
            </motion.h2>

            <Faq items={FAQ_ITEMS} accentFor={(index) => accentAt(c, index)} />
          </section>

          {/* ================= KAPANIŞ CTA ================= */}
          <section className="w-full py-28 px-6 flex flex-col items-center gap-6 text-center">
            <motion.h2
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5 }}
              className="text-2xl md:text-3xl max-w-lg"
              style={{
                color: "var(--fg)",
                fontFamily: "var(--font-heading)",
                fontWeight: 400,
              }}
            >
              See what your next exam might look like
            </motion.h2>
            <motion.button
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              whileHover={{ scale: 1.04, boxShadow: `0 12px 32px -8px ${c.accentGlow}` }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.5 }}
              onClick={() => setStage("steps")}
              className="btn-create-account"
            >
              Get Started
              <div className="icon">
                <svg height="24" width="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M0 0h24v24H0z" fill="none"></path>
                  <path
                    d="M16.172 11l-5.364-5.364 1.414-1.414L20 12l-7.778 7.778-1.414-1.414L16.172 13H4v-2z"
                    fill="currentColor"
                  ></path>
                </svg>
              </div>
            </motion.button>
          </section>
        </div>
      )}

      <div
        className={
          isSummary
            ? "flex flex-col items-center gap-5"
            : "absolute top-12 left-0 right-0 flex flex-col items-center gap-3"
        }
      >
        {answers.map((ans, i) => (
          <motion.div
            key={steps[i].key}
            layoutId={`step-${steps[i].key}`}
            transition={{ type: "spring", stiffness: 220, damping: 26 }}
          >
            <motion.div
              animate={{
                filter: isSummary ? "blur(0px)" : "blur(6px)",
                opacity: isSummary ? 1 : 0.55,
              }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <StrokeText
                text={ans}
                strokeColor={accentAt(c, i)}
                fillColor={accentAt(c, i)}
                fontFamily={FONT_FAMILY}
                strokeWidth={1.3}
                drawDuration={0.15}
                fillDelay={0}
                stagger={0}
                trigger="mount"
                fillMode="wipe"
                fontSize={isSummary ? BADGE_FONT_SUMMARY : BADGE_FONT_TOP}
                fontWeight={800}
                letterSpacing={-1}
              />
            </motion.div>
          </motion.div>
        ))}

        {stage === "summary" && (
          <AnimatePresence>
            {showCta && (
              <motion.div
                initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="flex flex-col items-center gap-4 mt-8"
              >
                {isSignedIn ? (
                  <button
                    onClick={() => router.push("/dashboard")}
                    className="btn-create-account"
                  >
                    Go to Dashboard
                    <div className="icon">
                      <svg
                        height="24"
                        width="24"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path d="M0 0h24v24H0z" fill="none"></path>
                        <path
                          d="M16.172 11l-5.364-5.364 1.414-1.414L20 12l-7.778 7.778-1.414-1.414L16.172 13H4v-2z"
                          fill="currentColor"
                        ></path>
                      </svg>
                    </div>
                  </button>
                ) : (
                  <>
                    {/* Üst Karşılama Metni */}
                    <p className="text-sm uppercase tracking-[0.2em] font-medium" style={{ color: "var(--accent-2)", fontFamily: FONT_FAMILY }}>
                      Let&apos;s get started
                    </p>

                    {/* Kayıt Modalı Butonu */}
                    <SignUpButton mode="modal" fallbackRedirectUrl="/dashboard">
                      <button className="btn-create-account">
                        Create Your Account
                        <div className="icon">
                          <svg
                            height="24"
                            width="24"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path d="M0 0h24v24H0z" fill="none"></path>
                            <path
                              d="M16.172 11l-5.364-5.364 1.414-1.414L20 12l-7.778 7.778-1.414-1.414L16.172 13H4v-2z"
                              fill="currentColor"
                            ></path>
                          </svg>
                        </div>
                      </button>
                    </SignUpButton>

                    {/* Giriş Yapma (Sign In) Bağlantısı */}
                    <div className="flex items-center gap-1.5 text-sm mt-1" style={{ color: "var(--fg-muted)", fontFamily: FONT_FAMILY }}>
                      <span>Already have an account?</span>
                      <SignInButton mode="modal" fallbackRedirectUrl="/dashboard">
                        <button className="cta-signin">
                          <span className="hover-underline-animation-signin">Sign In</span>
                          <svg
                            id="arrow-horizontal"
                            xmlns="http://www.w3.org/2000/svg"
                            width="24"
                            height="10"
                            viewBox="0 0 46 16"
                          >
                            <path
                              id="Path_10"
                              data-name="Path 10"
                              d="M8,0,6.545,1.455l5.506,5.506H-30V9.039H12.052L6.545,14.545,8,16l8-8Z"
                              transform="translate(30)"
                            ></path>
                          </svg>
                        </button>
                      </SignInButton>
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {stage === "steps" && currentStep && (
        <motion.div
          key={currentStep.key}
          layoutId={`step-${currentStep.key}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 240, damping: 28 }}
          className="flex flex-col items-center mt-20"
        >
          <motion.div
            animate={{ scale: open ? 0.62 : 1, y: open ? -16 : 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          >
            <StrokeText
              text={currentStep.title}
              strokeColor={stepColor}
              fillColor={stepColor}
              fontFamily={FONT_FAMILY}
              strokeWidth={1.4}
              drawDuration={1.2}
              fillDelay={0.1}
              stagger={0.04}
              trigger="mount"
              fillMode="wipe"
              fontSize={92}
              fontWeight={800}
              letterSpacing={-1.5}
            />
          </motion.div>

          <button
            onClick={() => setOpen((o) => !o)}
            className="mt-8 flex items-center gap-2 rounded-full border px-5 py-2 text-sm tracking-wide backdrop-blur-sm transition-colors hover:border-[var(--border-hover)]"
            style={{
              borderColor: open ? stepColor : "var(--border)",
              backgroundColor: open ? `${stepColor}1A` : "var(--surface)",
              color: "var(--fg)",
              fontFamily: FONT_FAMILY,
            }}
          >
            <span>Choose</span>
            <motion.span
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.3 }}
              className="inline-block text-xs"
            >
              ▾
            </motion.span>
          </button>

          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.35, ease: "easeInOut" }}
                className="mt-4 w-72 overflow-hidden rounded-2xl border"
                style={{
                  borderColor: "var(--border)",
                  // yarı saydam zemin açık temada okunmuyordu
                  backgroundColor: "var(--bg-elevated)",
                  boxShadow: "var(--shadow-lg)",
                }}
              >
                <div
                  className="border-b px-4 py-2.5"
                  style={{ borderColor: "var(--border)" }}
                >
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ara..."
                    className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--fg-faint)]"
                    style={{ color: "var(--fg)", fontFamily: FONT_FAMILY }}
                  />
                </div>

                <ul className="max-h-56 overflow-y-auto py-1">
                  {filteredOptions.length === 0 && (
                    <li className="px-4 py-3 text-sm" style={{ color: "var(--fg-faint)" }}>
                      Sonuç yok
                    </li>
                  )}
                  {filteredOptions.map((opt) => (
                    <li key={opt}>
                      <button
                        onClick={() => handleSelect(opt)}
                        className="group relative flex w-full items-center px-4 py-2.5 text-left text-sm transition-colors hover:bg-[var(--surface-hover)]"
                        style={{ color: "var(--fg-muted)", fontFamily: FONT_FAMILY }}
                      >
                        <span className="relative">
                          {opt}
                          <span
                            className="absolute left-0 -bottom-1 h-px w-full origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
                            style={{ backgroundColor: stepColor }}
                          />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {stage === "signup" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mt-16 flex flex-col items-center gap-6"
        >
          <p className="text-sm" style={{ color: "var(--fg-faint)" }}>
            Sign up ekranı buraya gelecek
          </p>
        </motion.div>
      )}
    </main>
  );
}