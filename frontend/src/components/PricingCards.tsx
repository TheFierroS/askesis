"use client";

import { motion } from "framer-motion";
import { PACKAGES, perQuestion, type CreditPackage } from "../lib/pricing";

/**
 * Paket kartları.
 *
 * Hem ana sayfada hem hakkı biten kullanıcıya gösterilen modalda kullanılıyor.
 * İki yerde iki ayrı fiyat listesi tutmak, birini güncelleyip diğerini unutmanın
 * en kolay yolu.
 */

function PackageCard({
    pkg,
    accent,
    compact,
}: {
    pkg: CreditPackage;
    accent: string;
    compact?: boolean;
}) {
    const available = Boolean(pkg.checkoutUrl);

    return (
        <div
            className={`relative flex flex-col rounded-2xl border ${compact ? "px-5 py-5" : "px-6 py-7"}`}
            style={{
                // Öne çıkan paket daha belirgin: göz bir yere tutunmadan
                // üç seçenek arasında karar veremiyor.
                borderColor: pkg.featured
                    ? accent
                    : "var(--border)",
                borderWidth: pkg.featured ? 2 : 1,
                backgroundColor: pkg.featured
                    ? `color-mix(in srgb, ${accent} 7%, var(--bg-elevated))`
                    : "var(--bg-elevated)",
            }}
        >
            {pkg.featured && (
                <span
                    className="absolute -top-2.5 left-5 rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-[0.15em]"
                    style={{
                        backgroundColor: accent,
                        color: "var(--on-accent)",
                        fontFamily: "var(--font-display)",
                        fontWeight: 700,
                    }}
                >
                    Most picked
                </span>
            )}

            <p
                className="text-xl"
                style={{
                    color: "var(--fg-muted)",
                    fontFamily: "var(--font-heading)",
                }}
            >
                {pkg.name}
            </p>

            <p
                className={compact ? "text-3xl mt-1" : "text-4xl mt-1"}
                style={{
                    color: "var(--fg)",
                    fontFamily: "var(--font-heading)",
                    fontWeight: 400,
                }}
            >
                {pkg.price}
            </p>

            <p
                className="mt-1 text-sm"
                style={{ color: accent, fontFamily: "var(--font-display)" }}
            >
                {pkg.credits} questions
            </p>

            <p className="mt-0.5 text-[11px]" style={{ color: "var(--fg-faint)" }}>
                {perQuestion(pkg)}
            </p>

            {!compact && (
                <p
                    className="mt-3 text-sm leading-relaxed flex-1"
                    style={{
                        color: "var(--fg-muted)",
                        fontFamily: "var(--font-geist-sans)",
                    }}
                >
                    {pkg.blurb}
                </p>
            )}

            <a
                href={pkg.checkoutUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!available}
                onClick={(e) => {
                    // Ödeme bağlanana kadar tıklama bir şey yapmasın.
                    if (!available) e.preventDefault();
                }}
                className="mt-5 rounded-full border px-4 py-2 text-center text-sm transition-colors"
                style={{
                    borderColor: available ? accent : "var(--border)",
                    backgroundColor: available && pkg.featured ? accent : "transparent",
                    color: available
                        ? pkg.featured
                            ? "var(--on-accent)"
                            : accent
                        : "var(--fg-faint)",
                    fontFamily: "var(--font-display)",
                    cursor: available ? "pointer" : "default",
                }}
            >
                {available ? "Buy credits" : "Coming soon"}
            </a>
        </div>
    );
}

export default function PricingCards({
    accentFor,
    compact = false,
}: {
    accentFor: (index: number) => string;
    compact?: boolean;
}) {
    return (
        <div
            className={`grid gap-4 w-full ${compact ? "sm:grid-cols-3" : "md:grid-cols-3"}`}
        >
            {PACKAGES.map((pkg, index) => (
                <motion.div
                    key={pkg.id}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.45, delay: index * 0.08 }}
                >
                    <PackageCard
                        pkg={pkg}
                        accent={accentFor(index)}
                        compact={compact}
                    />
                </motion.div>
            ))}
        </div>
    );
}