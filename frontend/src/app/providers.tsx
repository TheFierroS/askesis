"use client";

import { useMemo } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider, useTheme } from "../components/ThemeProvider";
import { makeClerkAppearance } from "./clerkTheme";

// Clerk'in appearance'ı bir prop; tema değişince yeni obje verip
// modal/kart renklerinin de anında dönmesini sağlıyoruz.
function ClerkWithTheme({ children }: { children: React.ReactNode }) {
    const { theme } = useTheme();
    const appearance = useMemo(() => makeClerkAppearance(theme), [theme]);

    return <ClerkProvider appearance={appearance}>{children}</ClerkProvider>;
}

export default function Providers({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider>
            <ClerkWithTheme>{children}</ClerkWithTheme>
        </ThemeProvider>
    );
}
