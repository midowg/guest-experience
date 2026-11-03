import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { ButtonLink, Notice } from "@/components/ui";
import { clockLabel, dayLabel, wibDate, wibTime } from "@/lib/pra-wam/appraisal";
import type { CheckInResult } from "@/lib/pra-wam/attendance";
import { praWamPath } from "@/lib/routes";
import { ServiceError } from "@/lib/server/config";
import { checkIn } from "@/lib/server/pra-wam/attendance";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Absen · Pra WAM", robots: { index: false }, referrer: "no-referrer" };

const at = (iso: string) => `${dayLabel(wibDate(iso))}, ${clockLabel(wibTime(iso))}`;

function answer(result: CheckInResult): { tone: "success" | "info" | "warning" | "error"; title: string; text: string } {
  switch (result.kind) {
    case "tercatat": return { tone: "success", title: "Absen tercatat", text: `Terima kasih. Kehadiranmu tercatat ${clockLabel(wibTime(result.checkedInAt))} WIB.` };
    case "sudah": return { tone: "success", title: "Sudah tercatat", text: `Kehadiranmu sudah tercatat ${clockLabel(wibTime(result.checkedInAt))} WIB. Tidak perlu memindai lagi.` };
    case "belum": return { tone: "info", title: "Absen belum dibuka", text: `Absen dibuka ${at(result.window.opens)} WIB, 30 menit sebelum sesi mulai. Pindai lagi nanti.` };
    case "tutup": return { tone: "warning", title: "Absen sudah ditutup", text: `Absen ditutup ${at(result.window.closes)} WIB. Bila kamu hadir, minta panitia mencatat secara manual.` };
    case "bukan-peserta": return { tone: "warning", title: "Kamu tidak terdaftar di sesi ini", text: "Bila seharusnya ikut, minta panitia menambahkanmu atau mencatat kehadiranmu." };
    case "belum-terbit": return { tone: "info", title: "Sesi belum terbit", text: "Sesi ini belum diterbitkan panitia, jadi absen belum bisa dicatat." };
    default: return { tone: "error", title: "QR tidak dikenal", text: "QR ini sudah diganti atau bukan QR absen Pra WAM. Pindai QR yang terpasang di ruang sesi." };
  }
}

/** What a printed session QR opens: signs the person in (after signing in to Pra WAM if needed). */
export default async function CheckInPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const member = await requireMemberPage(praWamPath.checkIn(token));
  const outcome = /^[A-Za-z0-9_-]{20,64}$/.test(token)
    ? await checkIn(token, member).catch((error: unknown) => { if (error instanceof ServiceError) return error.message; throw error; })
    : { result: { kind: "tidak-dikenal" } as CheckInResult, session: null };
  if (typeof outcome === "string") return <PraWamShell member={member} current="agenda"><Notice tone="warning">{outcome}</Notice></PraWamShell>;
  const shown = answer(outcome.result);
  return <PraWamShell member={member} current="agenda">
    <section className={`${styles.card} ${styles.narrow} ${styles.checkin}`} data-tone={shown.tone} aria-live="polite">
      <p className={styles.kicker}>{outcome.session?.title ?? "Absen Pra WAM"}</p>
      <h1>{shown.title}</h1>
      <p>{shown.text}</p>
      <div className={styles.actions}>
        {outcome.session && <ButtonLink href={praWamPath.session(outcome.session.id)}>Buka sesi</ButtonLink>}
        <ButtonLink variant="secondary" href={praWamPath.agenda}>Ke agenda</ButtonLink>
      </div>
    </section>
  </PraWamShell>;
}
