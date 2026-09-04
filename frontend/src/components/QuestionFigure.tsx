"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/**
 * Sorunun şekli.
 *
 * Görsel token ile korunuyor, o yüzden doğrudan <img src="/api/..."> ile
 * çekilemiyor — istekte Authorization başlığı olması gerekiyor. Blob olarak
 * indirip nesne URL'i üretiyoruz.
 *
 * Şekil sorunun ayrılmaz parçası: butonla açılmıyor, soruyla birlikte geliyor.
 * Devre şemasız bir devre sorusu ya da bölgesiz bir integral sorusu
 * cevaplanamaz.
 */
export default function QuestionFigure({
    questionId,
    fetchUrl,
}: {
    questionId: string;
    fetchUrl: (id: string) => Promise<string>;
}) {
    const [url, setUrl] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        let objectUrl: string | null = null;

        fetchUrl(questionId)
            .then((value) => {
                if (cancelled) {
                    // Bileşen söküldüyse indirdiğimiz görseli hemen bırak.
                    URL.revokeObjectURL(value);
                    return;
                }
                objectUrl = value;
                setUrl(value);
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });

        return () => {
            cancelled = true;
            // Nesne URL'i serbest bırakılmazsa görsel bellekte kalıyor.
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [questionId, fetchUrl]);

    if (failed) return null;

    return (
        <div className="flex justify-center">
            {url ? (
                <motion.img
                    src={url}
                    alt="Figure for this question"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    className="max-w-full rounded-xl"
                    style={{
                        // Şekiller saydam zeminli üretiliyor; koyu temada
                        // çizgiler siyah kaldığı için okunmuyordu. Açık bir
                        // zemin verip her iki temada da net görünmesini
                        // sağlıyoruz.
                        backgroundColor: "#ffffff",
                        padding: "0.75rem",
                        maxHeight: "22rem",
                    }}
                />
            ) : (
                // Yer tutucu: görsel gelince kart zıplamasın.
                <div
                    className="w-full rounded-xl animate-pulse"
                    style={{ height: "12rem", backgroundColor: "var(--surface)" }}
                />
            )}
        </div>
    );
}