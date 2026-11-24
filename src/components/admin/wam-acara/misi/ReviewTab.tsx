"use client";

import { useState } from "react";
import { ConsoleButton, Pill } from "@/components/console";
import { adminWhen } from "@/lib/main-wam/modul/admin";
import type { ReviewItem } from "@/lib/main-wam/misi/review-view";
import { mainWamAdminApi } from "@/lib/routes";
import { statusTone, statusWords } from "./status-words";
import css from "./misi-admin.module.css";

const CHECK_WORDS = { true: "Terpenuhi", false: "Belum", null: "Dinilai pemeriksa" } as const;
const VERDICT = { lolos: "Lolos", gagal: "Gagal", ragu: "Ragu" } as const;

/**
 * Admin WAM → Misi → Tinjauan: the proofs the automatic check could not decide ("perlu ditinjau"). Each
 * shows the photo large, the mission's TNC with what the checks found, the people tagged and what the
 * verifier said; Setujui gives the points, Tolak needs a reason the participant reads. The same
 * list and decision are served to panitia's screen later (server/main-wam/misi/review.ts).
 */
export function ReviewTab({ items, migrated, busy, run, call }: {
  items: ReviewItem[]; migrated: boolean; busy: boolean;
  run: (action: () => Promise<string>) => Promise<boolean>;
  call: (url: string, method: string, body?: unknown) => () => Promise<string>;
}) {
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  return <>
    <p className={css.note}>Foto yang belum bisa diputuskan pemeriksa otomatis. Periksa syaratnya, lalu setujui (poin masuk) atau tolak dengan alasan (peserta membacanya dan boleh kirim ulang bila batas kirim masih ada).</p>
    {!items.length && <p className={css.note}>{migrated ? "Tidak ada foto yang menunggu tinjauan." : "Menunggu pembaruan sistem."}</p>}
    <ul className={css.rows} aria-label="Antrean tinjauan">
      {items.map(item => <li key={item.id} className={css.review}>
        {item.photo
          // eslint-disable-next-line @next/next/no-img-element -- a short-lived storage address behind the admin API, or a demo picture
          ? <a href={item.photo} target="_blank" rel="noreferrer"><img className={css.bigPhoto} src={item.photo} alt={`Foto ${item.person} untuk ${item.missionTitle}`} loading="lazy" /></a>
          : <span className={css.bigPhoto} aria-hidden />}
        <div className={css.reviewBody}>
          <div className={css.reviewHead}>
            <h3>{item.missionTitle}</h3>
            <Pill tone="brass">{item.points.toLocaleString("id-ID")} poin</Pill>
            <Pill tone={statusTone[item.status]}>{statusWords[item.status]}</Pill>
          </div>
          <p className={css.small}>{item.person} · {item.department || "–"} · dikirim {adminWhen(item.submittedAt)} · percobaan {item.attempts}{item.maxAttempts ? ` dari ${item.maxAttempts}` : ""}</p>
          <div>
            <p className={css.small}><b>Syarat dan hasil pemeriksaan otomatis</b></p>
            <ul className={css.checklist}>
              {item.rules.map(rule => {
                const check = item.checks.find(candidate => candidate.type === rule.type);
                const ok = check ? check.ok : null;
                return <li key={rule.type}>
                  <span className={`${css.mark} ${ok === true ? css.markOk : ok === false ? css.markBad : css.markNeutral}`}>{CHECK_WORDS[String(ok) as "true" | "false" | "null"]}</span>
                  <span>{rule.text}{check?.reason ? ` (${check.reason})` : ""}</span>
                </li>;
              })}
            </ul>
          </div>
          <p className={css.small}><b>Ditandai:</b> {item.tags.length ? item.tags.map(tag => `${tag.name} (${tag.department || "–"})`).join(", ") : "tidak ada"}</p>
          {item.verifier && <p className={css.small}><b>Pemeriksa ({item.verifier.provider}):</b> {VERDICT[item.verifier.result.putusan]}{item.verifier.result.skor !== undefined ? ` · skor ${item.verifier.result.skor}` : ""}{item.verifier.result.alasan.length ? ` · ${item.verifier.result.alasan.join(" ")}` : ""}</p>}
          {rejecting === item.id
            ? <span className={css.inline}>
              <input className="input" aria-label={`Alasan menolak ${item.person}`} maxLength={300} placeholder="Alasan penolakan, dibaca peserta" value={note} onChange={event => setNote(event.target.value)} />
              <ConsoleButton variant="primary" disabled={busy || note.trim().length < 2} onClick={() => run(call(mainWamAdminApi.missionCompletion(item.id), "PATCH", { status: "ditolak", note })).then(ok => { if (ok) { setRejecting(null); setNote(""); } })}>Tolak</ConsoleButton>
              <ConsoleButton disabled={busy} onClick={() => { setRejecting(null); setNote(""); }}>Batal</ConsoleButton>
            </span>
            : <div className={css.actions}>
              <ConsoleButton variant="primary" disabled={busy} onClick={() => run(call(mainWamAdminApi.missionCompletion(item.id), "PATCH", { status: "disetujui", note: "" }))}>Setujui</ConsoleButton>
              <ConsoleButton disabled={busy} onClick={() => { setRejecting(item.id); setNote(""); }}>Tolak</ConsoleButton>
            </div>}
        </div>
      </li>)}
    </ul>
  </>;
}
