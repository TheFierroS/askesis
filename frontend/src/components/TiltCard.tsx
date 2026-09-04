"use client";

import { ReactNode, useRef, useState } from "react";
import { motion } from "framer-motion";

interface TiltCardProps {
    children: ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

export default function TiltCard({ children, className = "", style }: TiltCardProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [tilt, setTilt] = useState({ x: 0, y: 0 });

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        setTilt({ x: py * -8, y: px * 8 });
    };

    const handleMouseLeave = () => setTilt({ x: 0, y: 0 });

    return (
        <motion.div
            ref={ref}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            animate={{ rotateX: tilt.x, rotateY: tilt.y, scale: tilt.x || tilt.y ? 1.02 : 1 }}
            transition={{ type: "spring", stiffness: 250, damping: 20 }}
            style={{ perspective: 900, transformStyle: "preserve-3d", ...style }}
            className={className}
        >
            {children}
        </motion.div>
    );
}