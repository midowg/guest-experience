"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Info } from "lucide-react";
import { Avatar, ConsoleButton, Pill, type ConsoleTone } from "@/components/console";
import cs from "@/components/console/console.module.css";
import { Notice } from "@/components/ui";
import { spanLabel, type RequestStatus, type ScheduleRequest } from "@/lib/pra-wam/requests";
import { praWamApi } from "@/lib/routes";
import { errorText, praWamRequest } from "../api";
import type { RequestCheck } from "./schedule";
import styles from "../panitia.module.css";

/** A request with what the page worked out: the session's room now, and the check line (waiting ones only). */
export type RequestItem = ScheduleRequest & { fromRoom: string; check?: RequestCheck };

const statusPill: Record<RequestStatus, { label: string; tone: ConsoleTone }> = {
  diajukan: { label: "Menunggu", tone: "warn" }, disetujui: { label: "Disetujui", tone: "ok" },
  ditolak: { label: "Ditolak", tone: "bad" }, ditarik: { label: "Ditarik", tone: "neutral" },
};
const at = (iso: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));
const checkTone: Record<RequestCheck["tone"], ConsoleTone> = { ok: "ok", warn: "warn", neutral: "neutral" };

/**
 * Permintaan jadwal as cards (console "K4"): who asks to move which session, now and asked side by
 * side, whether the room is free, and for a waiting one Tolak or Setujui with a note. Approving
 * asks once more in place: the session moves and everyone in it is told.
 */
export function RequestCards({ requests, emptyText }: { requests: RequestItem[]; emptyText: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  async function answer(request: ScheduleRequest, approve: boolean) {
    setBusy(request.id); setNotice(null);
    try {
      const result = await praWamRequest(praWamApi.request(request.id), { method: "POST", json: { approve, note: notes[request.id] ?? "" } });
      setNotice({ tone: "success", text: result.message }); setConfirming(null); router.refresh();
    } catch (problem) { setNotice({ tone: "error", text: errorText(problem) }); }
    finally { setBusy(null); }
  }

  return <div className={styles.section}>
    {notice && <div role="status"><Notice tone={notice.tone}>{notice.text}</Notice></div>}
    {requests.length === 0 ? <p className={styles.empty}>{emptyText}</p> : <ul className={styles.reqList}>
      {requests.map(request => {
        const pill = statusPill[request.status];
        const waiting = request.status === "diajukan";
        return <li key={request.id}>
          <article className={styles.reqCard} aria-labelledby={`req-${request.id}`}>
            <div className={styles.reqHead}>
              <Avatar name={request.requester} size={40} />
              <span className={styles.reqWho}>
                <strong id={`req-${request.id}`}>{request.requester}</strong>
                <span>Ganti jadwal · {request.sessionTitle}</span>
                <small>Diajukan {at(request.createdAt)}{request.reviewedAt ? ` · dijawab ${at(request.reviewedAt)}` : ""}</small>
              </span>
              <Pill tone={pill.tone}>{pill.label}</Pill>
            </div>
            <div className={styles.reqCompare}>
              <span className={styles.reqBox}><small>Sekarang</small><strong>{spanLabel(request.fromStartsAt, request.fromEndsAt)}</strong><span>{request.fromRoom}</span></span>
              <span className={styles.reqArrow} aria-hidden="true"><ArrowRight size={20} /></span>
              <span className={`${styles.reqBox} ${styles.reqBoxAsked}`}><small>Diminta</small><strong>{spanLabel(request.toStartsAt, request.toEndsAt)}</strong><span>{request.toRoomName ?? "Ruang tetap"}</span></span>
            </div>
            <p className={styles.reqReason}>Alasan: &ldquo;{request.reason}&rdquo;</p>
            {request.reviewNote && <p className={styles.reqReason}>Catatan panitia: {request.reviewNote}</p>}
            {waiting && request.check && <p className={`${styles.reqCheck} ${cs.toned}`} data-tone={checkTone[request.check.tone]}>
              {request.check.tone === "ok" ? <CheckCircle2 size={16} aria-hidden /> : request.check.tone === "warn" ? <AlertTriangle size={16} aria-hidden /> : <Info size={16} aria-hidden />}
              <span>{request.check.text}</span>
            </p>}
            {waiting && <>
              <input className={styles.fieldInput} aria-label={`Catatan untuk ${request.requester}`} placeholder="Catatan untuk pengaju (opsional)" maxLength={1000}
                value={notes[request.id] ?? ""} onChange={event => setNotes({ ...notes, [request.id]: event.target.value })} />
              {confirming === request.id ? <div className={styles.reqConfirm}>
                <span>Jadwal sesi berubah ke {spanLabel(request.toStartsAt, request.toEndsAt)} dan semua peserta sesi menerima notifikasi. Lanjutkan?</span>
                <div className={styles.reqActions}>
                  <ConsoleButton disabled={!!busy} onClick={() => setConfirming(null)}>Batal</ConsoleButton>
                  <ConsoleButton variant="primary" disabled={!!busy} onClick={() => answer(request, true)}>{busy === request.id ? "Menyimpan…" : "Ya, setujui"}</ConsoleButton>
                </div>
              </div> : <div className={styles.reqActions}>
                <ConsoleButton disabled={!!busy} onClick={() => answer(request, false)}>{busy === request.id ? "Menyimpan…" : "Tolak"}</ConsoleButton>
                <ConsoleButton variant="primary" disabled={!!busy || !request.stillCurrent} onClick={() => setConfirming(request.id)}>Setujui</ConsoleButton>
              </div>}
            </>}
          </article>
        </li>;
      })}
    </ul>}
  </div>;
}
