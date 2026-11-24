import type { CompletionStatus } from "@/lib/main-wam/misi/types";

/** The words and tones of a proof's status in Admin WAM (Misi). */
export const statusWords: Record<CompletionStatus, string> = { menunggu: "Perlu ditinjau", dikirim: "Dikirim", diperiksa: "Diperiksa", perlu_ditinjau: "Perlu ditinjau", disetujui: "Disetujui", ditolak: "Ditolak" };
export const statusTone = { menunggu: "warn", dikirim: "neutral", diperiksa: "neutral", perlu_ditinjau: "warn", disetujui: "ok", ditolak: "bad" } as const;
