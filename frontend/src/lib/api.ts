/**
 * Backend istemcisi.
 *
 * Her istekte Clerk token'ı ekliyor. Token'ı önbelleğe ALMIYORUZ: Clerk oturum
 * token'larının ömrü 60 saniye ve Clerk SDK'sı getToken() çağrıldığında
 * gerekiyorsa yenisini alıyor. Kendimiz saklarsak süresi dolmuş token
 * göndeririz.
 */

const BASE_URL =
    process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export interface CatalogEntry {
    department: string;
    course: string;
    exam_type: string;
}

export interface Question {
    id: string;
    prompt: string;
    topic: string;
    difficulty: "easy" | "medium" | "hard";
    /** Şekli olan sorular /api/questions/{id}/figure adresinden çekiliyor. */
    has_figure: boolean;
}

export interface CreditAccount {
    user_id: string;
    /** Clerk'ten geliyor; sunucuda anahtar tanımlı değilse boş. */
    name: string;
    email: string;
    balance: number;
    used_total: number;
    created_at: string;
    updated_at: string;
}

export interface ExamResponse {
    questions: Question[];
    /** "pool" = hazır havuzdan geldi (anında). "generated" = anlık üretildi. */
    source: "pool" | "generated";
    /** Geçmişe kaydedilen sınavın id'si. */
    exam_id: string;
    /** İşlem sonrası kalan soru hakkı. */
    credits_left: number;
    /**
     * Kaç soru istenmişti. Referans sınavlar sınırlıysa backend daha az soru
     * döndürebiliyor; questions.length ile karşılaştırıp kullanıcıya
     * açıklama gösteriyoruz.
     */
    requested: number;
}

export interface ExamSummary {
    id: string;
    department: string;
    course: string;
    exam_type: string;
    /** ISO 8601, UTC */
    created_at: string;
    question_count: number;
}

export interface ExamDetail {
    exam: ExamSummary;
    questions: Question[];
}

export interface AdminDocument {
    document_id: string;
    department: string;
    course: string;
    exam_type: string;
    source_name: string;
    uploaded_at: string;
    question_count: number;
    has_file: boolean;
}

export interface PoolStat {
    department: string;
    course: string;
    exam_type: string;
    total: number;
    oldest: string | null;
    newest: string | null;
}

export interface UploadResult {
    document_id: string;
    chunk_count: number;
    /** digital | ocr | vision | plain — hangi katmandan çıktı */
    method: string;
    needs_review: boolean;
    notes: string[];
}

export interface SolutionResponse {
    question_id: string;
    solution: string;
}

/**
 * Backend'in döndürdüğü hataları taşıyan sınıf.
 * status'u tutuyoruz çünkü arayüzde farklı davranmamız gerekiyor:
 * 404 "bu ders için sınav yüklenmemiş", 503 "servis meşgul, tekrar dene".
 */
export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
    ) {
        super(message);
        this.name = "ApiError";
    }
}

type TokenGetter = () => Promise<string | null>;

async function request<T>(
    path: string,
    {
        getToken,
        method = "GET",
        body,
    }: { getToken: TokenGetter; method?: string; body?: unknown },
): Promise<T> {
    const token = await getToken();

    const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
        // FastAPI hataları {"detail": "..."} biçiminde döndürüyor.
        // Doğrulama hatalarında (422) detail bir dizi oluyor, onu da ele alıyoruz.
        let detail = `İstek başarısız (${response.status})`;
        try {
            const payload = await response.json();
            if (typeof payload.detail === "string") {
                detail = payload.detail;
            } else if (Array.isArray(payload.detail)) {
                detail = payload.detail[0]?.msg ?? detail;
            }
        } catch {
            // gövde JSON değilse varsayılan mesajla devam
        }
        throw new ApiError(response.status, detail);
    }

    return response.json() as Promise<T>;
}

export function createApi(getToken: TokenGetter) {
    return {
        catalog: () => request<CatalogEntry[]>("/api/catalog", { getToken }),

        createExam: (params: {
            department: string;
            course: string;
            exam_type: string;
            num_questions: number;
        }) =>
            request<ExamResponse>("/api/exam", {
                getToken,
                method: "POST",
                body: params,
            }),

        /**
         * Sınav kağıdını PDF olarak indirir.
         *
         * request() kullanmıyoruz çünkü o JSON bekliyor; burada dönen şey ikili
         * veri. Blob olarak alıp tarayıcıya indirtiyoruz.
         */
        examPdf: async (params: {
            question_ids: string[];
            course: string;
            exam_type: string;
        }) => {
            const token = await getToken();
            const response = await fetch(`${BASE_URL}/api/exam/pdf`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify(params),
            });

            if (!response.ok) {
                let detail = `PDF alınamadı (${response.status})`;
                try {
                    const payload = await response.json();
                    if (typeof payload.detail === "string") detail = payload.detail;
                } catch {
                    // gövde JSON değilse varsayılan mesaj
                }
                throw new ApiError(response.status, detail);
            }

            return response.blob();
        },

        /**
         * Sorunun şeklini indirip geçici bir nesne URL'i üretir.
         *
         * <img src="/api/..."> doğrudan kullanılamıyor: isteğe Authorization
         * başlığı eklenemiyor ve sunucu 401 dönüyor.
         */
        figureUrl: async (questionId: string) => {
            const token = await getToken();
            const response = await fetch(
                `${BASE_URL}/api/questions/${questionId}/figure`,
                { headers: token ? { Authorization: `Bearer ${token}` } : {} },
            );
            if (!response.ok) throw new ApiError(response.status, "No figure.");
            return URL.createObjectURL(await response.blob());
        },

        credits: () =>
            request<{ balance: number }>("/api/credits", { getToken }),

        adminCredits: () =>
            request<CreditAccount[]>("/api/admin/credits", { getToken }),

        adminGrantCredits: (params: {
            user_id: string;
            amount: number;
            reason?: string;
        }) =>
            request<{ balance: number }>("/api/admin/credits", {
                getToken,
                method: "POST",
                body: params,
            }),

        exams: () => request<ExamSummary[]>("/api/exams", { getToken }),

        exam: (examId: string) =>
            request<ExamDetail>(`/api/exams/${examId}`, { getToken }),

        deleteExam: async (examId: string) => {
            const token = await getToken();
            const response = await fetch(`${BASE_URL}/api/exams/${examId}`, {
                method: "DELETE",
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            // 204 No Content: gövde yok, response.json() burada patlar.
            if (!response.ok) {
                throw new ApiError(response.status, "Sınav silinemedi.");
            }
        },

        // ---- admin ----

        adminDocuments: () =>
            request<AdminDocument[]>("/api/admin/documents", { getToken }),

        adminPool: () => request<PoolStat[]>("/api/admin/pool", { getToken }),

        adminUpload: async (params: {
            department: string;
            course: string;
            exam_type: string;
            file: File;
        }) => {
            const token = await getToken();
            const form = new FormData();
            form.append("department", params.department);
            form.append("course", params.course);
            form.append("exam_type", params.exam_type);
            form.append("file", params.file);

            // Content-Type BİLEREK verilmiyor: FormData gönderirken tarayıcının
            // kendi başlığı (multipart sınır dizesiyle birlikte) gerekiyor.
            // Elle "multipart/form-data" yazarsak sınır kaybolur ve sunucu
            // gövdeyi ayrıştıramaz.
            const response = await fetch(`${BASE_URL}/api/admin/upload`, {
                method: "POST",
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                body: form,
            });

            if (!response.ok) {
                let detail = `Upload failed (${response.status})`;
                try {
                    const payload = await response.json();
                    if (typeof payload.detail === "string") detail = payload.detail;
                } catch {
                    // gövde JSON değilse varsayılan mesaj
                }
                throw new ApiError(response.status, detail);
            }

            return (await response.json()) as UploadResult;
        },

        adminDeleteDocument: async (documentId: string) => {
            const token = await getToken();
            const response = await fetch(
                `${BASE_URL}/api/admin/documents/${documentId}`,
                {
                    method: "DELETE",
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                },
            );
            if (!response.ok) {
                throw new ApiError(response.status, "Could not delete the exam.");
            }
        },

        /**
         * Önizleme için dosyayı indirip geçici bir nesne URL'i üretir.
         *
         * Doğrudan <iframe src="/api/..."> kullanamıyoruz: iframe isteğine
         * Authorization başlığı eklenemiyor, sunucu da 401 döner. Dosyayı
         * fetch ile alıp blob URL'ine çevirmek tek yol.
         */
        adminDocumentUrl: async (documentId: string) => {
            const token = await getToken();
            const response = await fetch(
                `${BASE_URL}/api/admin/documents/${documentId}/file`,
                { headers: token ? { Authorization: `Bearer ${token}` } : {} },
            );
            if (!response.ok) {
                throw new ApiError(response.status, "File could not be loaded.");
            }
            return URL.createObjectURL(await response.blob());
        },

        solution: (questionId: string) =>
            request<SolutionResponse>(
                `/api/questions/${questionId}/solution`,
                { getToken, method: "POST" },
            ),
    };
}