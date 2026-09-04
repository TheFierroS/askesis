// Clerk teması — artık tek sabit obje değil, temaya göre üretilen bir fabrika.
// Not: Appearance tipini "@clerk/types"tan import etmiyoruz (projede doğrudan
// bağımlılık olmayabilir); Clerk objeyi yapısal olarak çözümlüyor.
//
// Neden CSS değişkeni (var(--bg)) kullanmıyoruz?
// Clerk, `variables` içindeki renkleri okuyup kendi tonlarını (hover, alpha,
// disabled vb.) hesaplıyor. "var(--bg)" verilirse bu hesap patlıyor ve bazı iç
// bileşenler siyah kalıyor. Bu yüzden burada gerçek hex/rgba değerleri var.

type Mode = "dark" | "light";

const T = {
    dark: {
        bg: "#272727",
        bgDeep: "#1C1C1C",
        card: "#2B2B2BE0", // %88 opaklık — modal arkasında cam etkisi
        fg: "#EAE7DC",
        fgMuted: "#9A9894",
        fgFaint: "#747474",
        surface: "rgba(234,231,220,0.06)",
        surfaceHover: "rgba(234,231,220,0.10)",
        border: "rgba(234,231,220,0.14)",
        borderStrong: "rgba(234,231,220,0.26)",
        accent: "#FF652F",
        accentSolid: "#FF652F",
        onAccent: "#1C1C1C",
        ring: "rgba(255,101,47,0.30)",
        glow: "rgba(255,101,47,0.10)",
        danger: "#E85A4F",
        success: "#14A76C",
        backdrop: "rgba(20,20,20,0.65)",
        shadow: "0 24px 60px -20px rgba(0,0,0,0.70)",
        logoFilter: "grayscale(1) brightness(1.6) opacity(0.65)",
        githubIconFilter: "invert(1) brightness(1.6)",
    },
    light: {
        bg: "#EAE7DC",
        bgDeep: "#DDD9CB",
        card: "#F3F1E9F2",
        fg: "#272727",
        fgMuted: "#6E6D6A",
        fgFaint: "#8E8D8A",
        surface: "rgba(216,195,165,0.28)",
        surfaceHover: "rgba(216,195,165,0.48)",
        border: "rgba(142,141,138,0.32)",
        borderStrong: "rgba(142,141,138,0.55)",
        accent: "#E85A4F",
        accentSolid: "#C7443A",
        onAccent: "#FFF8F5",
        ring: "rgba(232,90,79,0.28)",
        glow: "rgba(216,195,165,0.35)",
        danger: "#C7443A",
        success: "#0F8557",
        backdrop: "rgba(39,39,39,0.35)",
        shadow: "0 24px 60px -24px rgba(39,39,39,0.30)",
        logoFilter: "grayscale(1) opacity(0.55)",
        githubIconFilter: "none", // GitHub ikonu zaten siyah, açık zeminde sorun yok
    },
} as const;

export function makeClerkAppearance(mode: Mode) {
    const c = T[mode];

    return {
        variables: {
            colorPrimary: c.accentSolid,
            // ⚠️ "transparent" YAPMAYIN: footer/navbar/scrollBox gibi iç bileşenler
            // arka planlarını doğrudan bu değişkenden alıyor; transparent olunca
            // tarayıcının varsayılan (siyah) zemini görünüyor.
            colorBackground: c.bg,
            colorText: c.fg,
            colorTextSecondary: c.fgMuted,
            colorTextOnPrimaryBackground: c.onAccent,
            colorInputBackground: c.surface,
            colorInputText: c.fg,
            colorNeutral: c.fg,
            colorDanger: c.danger,
            colorSuccess: c.success,
            colorShimmer: c.surfaceHover,
            borderRadius: "1rem",
            fontFamily: "var(--font-geist-sans)",
            fontFamilyButtons: "var(--font-display)",
            fontWeight: { normal: 400, medium: 500, bold: 700 },
        },

        layout: {
            socialButtonsPlacement: "top",
            socialButtonsVariant: "blockButton",
            shimmer: true,
        },

        elements: {
            // ---- Modal arkaplanı ----
            modalBackdrop: {
                backdropFilter: "blur(8px)",
                backgroundColor: c.backdrop,
            },
            modalContent: { backgroundColor: "transparent", boxShadow: "none" },

            // ---- Ana kart ----
            card: {
                backgroundColor: c.card,
                backgroundImage: `radial-gradient(120% 120% at 0% 0%, ${c.glow} 0%, transparent 55%)`,
                backdropFilter: "blur(22px)",
                WebkitBackdropFilter: "blur(22px)",
                border: `1px solid ${c.border}`,
                borderRadius: "1.5rem",
                boxShadow: c.shadow,
                padding: "2rem",
            },

            // ---- Başlıklar ----
            header: { gap: "0.35rem" },
            headerTitle: {
                fontFamily: "var(--font-display)",
                color: c.fg,
                fontWeight: 700,
                fontSize: "1.4rem",
                letterSpacing: "-0.02em",
            },
            headerSubtitle: {
                color: c.fgMuted,
                fontFamily: "var(--font-geist-sans)",
                fontSize: "0.85rem",
            },

            // ---- Sosyal butonlar ----
            socialButtonsBlockButton: {
                backgroundColor: c.surface,
                border: `1px solid ${c.border}`,
                color: c.fg,
                borderRadius: "0.85rem",
                padding: "0.65rem",
                transition: "all 0.2s ease",
                "&:hover": {
                    backgroundColor: c.surfaceHover,
                    borderColor: c.borderStrong,
                },
            },
            socialButtonsBlockButtonText: {
                color: c.fg,
                fontFamily: "var(--font-geist-sans)",
                fontWeight: 500,
                fontSize: "0.85rem",
            },
            socialButtonsBlockButtonArrow: { display: "none" },
            socialButtonsProviderIcon__github: { filter: c.githubIconFilter },
            socialButtonsBlockButton__github: {
                backgroundColor: c.surface,
                border: `1px solid ${c.border}`,
            },

            // ---- "veya" ayracı ----
            dividerRow: { margin: "1.1rem 0" },
            dividerLine: { backgroundColor: c.border },
            dividerText: {
                color: c.fgFaint,
                fontFamily: "var(--font-geist-sans)",
                fontSize: "0.75rem",
                letterSpacing: "0.08em",
            },

            // ---- Form alanları ----
            formFieldLabel: {
                color: c.fgMuted,
                fontFamily: "var(--font-geist-sans)",
                fontWeight: 500,
                fontSize: "0.8rem",
            },
            formFieldInput: {
                backgroundColor: c.surface,
                border: `1px solid ${c.border}`,
                color: c.fg,
                borderRadius: "0.85rem",
                padding: "0.65rem 0.9rem",
                "&:focus": {
                    borderColor: c.accent,
                    boxShadow: `0 0 0 3px ${c.ring}`,
                },
                "&::placeholder": { color: c.fgFaint },
            },
            formFieldInputShowPasswordButton: { color: c.fgMuted },
            formFieldHintText: { color: c.fgFaint },
            formFieldErrorText: { color: c.danger },
            formFieldSuccessText: { color: c.success },

            // ---- Ana buton (.btn-create-account ile aynı ruhta) ----
            formButtonPrimary: {
                backgroundColor: c.accentSolid,
                color: c.onAccent,
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: "0.85rem",
                textTransform: "none",
                borderRadius: "999px",
                border: "none",
                boxShadow: `0 10px 28px -14px ${c.accentSolid}`,
                padding: "0.75rem 1.25rem",
                transition: "all 0.25s ease",
                "&:hover": {
                    filter: "brightness(1.08)",
                    transform: "translateY(-1px)",
                },
                "&:focus": { boxShadow: `0 0 0 3px ${c.ring}` },
            },

            // ---- Alt bilgi / linkler ----
            footer: {
                backgroundColor: c.card,
                backdropFilter: "blur(22px)",
                WebkitBackdropFilter: "blur(22px)",
                borderTop: `1px solid ${c.border}`,
                borderBottomLeftRadius: "1.5rem",
                borderBottomRightRadius: "1.5rem",
            },
            footerAction: { marginTop: "0.5rem", backgroundColor: "transparent" },
            footerActionText: {
                color: c.fgMuted,
                fontFamily: "var(--font-geist-sans)",
                fontSize: "0.85rem",
            },
            footerActionLink: {
                color: c.accent,
                fontWeight: 700,
                "&:hover": { color: c.fg },
            },
            logoBox: { backgroundColor: "transparent" },
            logoImage: { filter: c.logoFilter },

            // ---- OTP / doğrulama kodu ----
            otpCodeFieldInput: {
                backgroundColor: c.surface,
                border: `1px solid ${c.border}`,
                color: c.fg,
                borderRadius: "0.6rem",
            },
            formResendCodeLink: { color: c.accent, fontWeight: 600 },

            // ---- Kimlik önizleme ----
            identityPreview: {
                backgroundColor: c.surface,
                border: `1px solid ${c.border}`,
                borderRadius: "999px",
            },
            identityPreviewText: {
                color: c.fg,
                fontFamily: "var(--font-geist-sans)",
            },
            identityPreviewEditButton: {
                color: c.fgMuted,
                "&:hover": { color: c.fg },
            },

            // ---- Badge'ler ----
            badge: {
                backgroundColor: c.surfaceHover,
                color: `${c.fg} !important`,
                border: `1px solid ${c.border}`,
                borderRadius: "999px",
                fontFamily: "var(--font-geist-sans)",
                fontSize: "0.7rem",
                fontWeight: 600,
                padding: "0.2rem 0.6rem",
            },

            // "Last used" rozeti — gerçek class cl-lastAuthenticationStrategyBadge,
            // generic "badge" anahtarı bunu hedeflemiyor.
            lastAuthenticationStrategyBadge: {
                backgroundColor: c.bgDeep,
                backgroundImage: "none", // Clerk'in color-mix gradient'ini eziyoruz
                color: `${mode === "dark" ? c.fg : c.onAccent} !important`,
                border: `1px solid ${c.borderStrong}`,
                borderRadius: "999px",
                fontFamily: "var(--font-geist-sans)",
                fontSize: "0.7rem",
                fontWeight: 600,
                padding: "0.2rem 0.6rem",
                "& span": {
                    color: `${mode === "dark" ? c.fg : c.onAccent} !important`,
                },
                "& p": {
                    color: `${mode === "dark" ? c.fg : c.onAccent} !important`,
                },
            },

            // ---- Kapatma (X) ----
            modalCloseButton: {
                color: c.fgMuted,
                "&:hover": { color: c.fg, backgroundColor: c.surfaceHover },
            },

            // ---- UserButton popover ----
            userButtonPopoverCard: {
                backgroundColor: c.card,
                backdropFilter: "blur(22px)",
                WebkitBackdropFilter: "blur(22px)",
                border: `1px solid ${c.border}`,
                borderRadius: "1.25rem",
                boxShadow: c.shadow,
            },
            userButtonPopoverMain: { backgroundColor: "transparent" },
            userButtonPopoverActionButton: {
                color: c.fg,
                fontFamily: "var(--font-geist-sans)",
                "&:hover": { backgroundColor: c.surfaceHover },
            },
            userButtonPopoverActionButtonText: { color: c.fg, fontWeight: 500 },
            userButtonPopoverActionButtonIcon: { color: c.fgMuted },
            userPreviewMainIdentifier: {
                color: c.fg,
                fontFamily: "var(--font-display)",
            },
            userPreviewSecondaryIdentifier: { color: c.fgMuted },
            avatarBox: { border: `2px solid ${c.accent}` },

            // ---- UserProfile (Manage account) ----
            // navbar + scrollBox "card" stilinin dışında kaldığı için ayrı zemin şart.
            cardBox: {
                backgroundColor: c.card,
                backdropFilter: "blur(22px)",
                WebkitBackdropFilter: "blur(22px)",
                border: `1px solid ${c.border}`,
                borderRadius: "1.5rem",
                boxShadow: c.shadow,
                overflow: "hidden",
            },
            scrollBox: { backgroundColor: "transparent" },
            pageScrollBox: { backgroundColor: "transparent", padding: "2rem" },
            page: { backgroundColor: "transparent" },
            navbar: {
                backgroundColor: c.bgDeep,
                borderRight: `1px solid ${c.border}`,
                border: "none",
            },
            navbarButtons: { backgroundColor: "transparent" },
            navbarMobileMenuRow: { backgroundColor: c.bg },
            navbarButton: {
                color: c.fgMuted,
                fontFamily: "var(--font-geist-sans)",
                "&:hover": { color: c.fg, backgroundColor: c.surfaceHover },
            },
            profileSectionTitleText: {
                color: c.fg,
                fontFamily: "var(--font-display)",
                fontWeight: 700,
            },
            profileSectionContent: { color: c.fgMuted },
            accordionTriggerButton: { color: c.fg },
            menuButton: { color: c.fgMuted, "&:hover": { color: c.fg } },
            menuList: {
                backgroundColor: c.card,
                border: `1px solid ${c.border}`,
            },
            menuItem: { color: c.fg, "&:hover": { backgroundColor: c.surfaceHover } },
        },
    };
}

// Geriye dönük uyumluluk: eski `clerkAppearance` importları kırılmasın.
export const clerkAppearance = makeClerkAppearance("dark");