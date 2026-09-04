"use client";

import { ReactNode, useRef } from "react";
import { motion } from "framer-motion";
import { useThemeColors } from "./themeColors";

export default function MagneticButton({
    children,
    onClick,
    className = "",
}: {
    children: ReactNode;
    onClick?: () => void;
    className?: string;
}) {
    const c = useThemeColors();
    const ref = useRef<HTMLButtonElement>(null);

    const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        const x = (e.clientX - rect.left - rect.width / 2) * 0.25;
        const y = (e.clientY - rect.top - rect.height / 2) * 0.25;
        ref.current!.style.transform = `translate(${x}px, ${y}px)`;
    };

    const handleMouseLeave = () => {
        if (ref.current) ref.current.style.transform = "translate(0px, 0px)";
    };

    return (
        <motion.button
            ref={ref}
            onClick={onClick}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            whileHover={{
                scale: 1.04,
                boxShadow: `0 12px 32px -8px ${c.accentGlow}`,
            }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className={className}
            style={{ transition: "transform 0.15s ease-out" }}
        >
            {children}
        </motion.button>
    );
}