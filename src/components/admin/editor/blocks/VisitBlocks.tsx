import { ImagePlus, MapPin } from "lucide-react";
import { ButtonLink, Notice } from "@/components/ui";
import { Check } from "@/components/admin/editor/controls";
import type { EditorKit } from "@/components/admin/editor/kit";
import { WERKUDARA_OFFICE } from "@/components/admin/editor/suggestions";
import { AfterBlock } from "@/components/admin/editor/JourneyEditor";
import { adminEventPath, thanksPath } from "@/lib/routes";
import { EventLink } from "./EventLink";
import { FeedbackBlock } from "./FeedbackBlock";
import { HeroBlock } from "./HeroBlock";
import { ReviewBlock } from "./ReviewBlock";
import { ScheduleBlock } from "./ScheduleBlock";
import { TopicsBlock } from "./TopicsBlock";
import styles from "@/components/admin/admin.module.css";

/*
 * Kunjungan Kantor's own blocks (board 12, "Admin Kunjungan Kantor"): one per guest screen, worded
 * for a visit, not an invitation. The fields are the event's usual ones, so the guest page, BEO,
 * and the server read them as before.
 */

/** Info kunjungan: what the welcome card, the BEO and the calendar file take their facts from. */
export function VisitInfoBlock({ kit, onTimezone }: { kit: EditorKit; onTimezone: (zone: string) => void }) {
  const { event, update, text, choices, unavailable } = kit;
  const office = event.venue_name === WERKUDARA_OFFICE.venue_name && event.address === WERKUDARA_OFFICE.address;
  return <div className="stack">
    {text("title", "Nama kunjungan", 180, false, "Tampil kecil di bawah sambutan, di daftar acara, dan di BEO. Contoh: Kunjungan PT Nusantara Energi.")}
    {event.code && <EventLink event={event} origin={kit.origin} label="Tautan untuk tamu" />}
    {text("organizer", "Tuan rumah", 250, false, "Biasanya Werkudara Group. Wajib sebelum terbit.")}
    <ScheduleBlock kit={kit} onTimezone={onTimezone} />
    {!office && <div className={styles.chips}>
      <button type="button" className={styles.chip} onClick={() => { update("venue_name", WERKUDARA_OFFICE.venue_name); update("address", WERKUDARA_OFFICE.address); update("location_url", WERKUDARA_OFFICE.location_url); }}>
        <MapPin size={14} aria-hidden="true" /> Pakai alamat kantor Werkudara
      </button>
    </div>}
    {text("venue_name", "Tempat", 200)}{text("address", "Alamat", 1000, true, "Peta, petunjuk, dan rute diisi di Cara datang.")}
    {choices("invitation_mode", "Cara mengundang", [{ value: "open" as const, label: "Tautan umum" }, ...(unavailable("personal") ? [] : [{ value: "personal" as const, label: "Tautan pribadi per tamu" }])], event.invitation_mode, value => update("invitation_mode", value), value => value === "personal"
      ? "Setiap tamu mendapat tautan dengan namanya. Konfirmasi hanya lewat tautan pribadi."
      : "Satu tautan untuk satu rombongan. Setiap orang mengisi namanya sendiri saat konfirmasi.")}
    {event.invitation_mode === "personal" && <ButtonLink href={adminEventPath(event, "invitations")} variant="secondary">Kelola tautan pribadi tamu</ButtonLink>}
  </div>;
}

/** Sambutan: the big greeting, one opening sentence, and the cover photo. */
export function VisitWelcomeBlock({ kit }: { kit: EditorKit }) {
  const { text } = kit;
  return <div className="stack">
    {text("greeting", "Judul sambutan", 60, false, "Tampil besar di bawah foto. Kosongkan untuk memakai: Selamat datang di Werkudara.")}
    {text("subtitle", "Kalimat pembuka", 200, true, "Satu atau dua kalimat sudah cukup. Kosongkan untuk memakai kalimat bawaan.")}
    <p className="field-hint">Tanggal, jam, dan alamat di kartu sambutan diambil dari Info kunjungan.</p>
    <h3>Foto sampul</h3>
    <HeroBlock kit={kit} />
  </div>;
}

/** Tentang kunjungan: why the visit, then the topics. */
export function VisitAboutBlock({ kit }: { kit: EditorKit }) {
  const { text } = kit;
  return <div className="stack">
    {text("introduction", "Kenapa kunjungan ini", 5000, true, "Tujuan kunjungan dalam beberapa kalimat. Wajib sebelum terbit.")}
    <h3>Topik yang dibahas</h3>
    <TopicsBlock kit={kit} />
  </div>;
}

/** Terima kasih & survei: the thank-you page with its survey and the optional Google review. */
export function VisitAfterBlock({ kit }: { kit: EditorKit }) {
  const { event, update, control, errors, text, unavailable, origin } = kit;
  const surveyOn = event.feedback_enabled && event.sections.some(section => section.key === "feedback" && section.enabled);
  const setSurvey = (on: boolean) => {
    update("sections", event.sections.map(section => section.key === "feedback" ? { ...section, enabled: on } : section));
    update("feedback_enabled", on);
  };
  return <div className="stack">
    <AfterBlock event={event} update={update} control={control} errors={errors} collaboration={!unavailable("collaboration")} origin={origin} />
    {text("closing", "Kalimat penutup", 2000, true, "Dipakai sebagai pesan terima kasih bila Pesan di atas kosong.")}
    {!unavailable("feedback") && <>
      <h3>Survei</h3>
      <Check label="Tampilkan survei di halaman terima kasih" checked={surveyOn} onChange={setSurvey} />
      {surveyOn && <FeedbackBlock kit={kit} />}
    </>}
    {!unavailable("review") && event.audience !== "internal" && <>
      <h3>Ulasan Google (opsional)</h3>
      <Check label="Tampilkan ajakan ulasan Google" checked={event.review_enabled} onChange={on => update("review_enabled", on)} />
      {event.review_enabled && <ReviewBlock kit={kit} />}
    </>}
  </div>;
}

/** Foto kunjungan: the photos are uploaded on the Foto page and reach guests through the thank-you link. */
export function VisitPhotosBlock({ kit }: { kit: EditorKit }) {
  const { event, origin } = kit;
  return <div className="stack">
    <p>Foto kunjungan diunggah di halaman <strong>Foto</strong>, lalu tampil untuk tamu di halaman terima kasih. Foto potret dan mendatar tersusun rapat tanpa celah, dan tamu bisa membuka serta mengunduh tiap foto.</p>
    <ButtonLink href={adminEventPath(event, "gallery")} variant="secondary"><ImagePlus size={17} aria-hidden="true" /> Unggah dan atur foto</ButtonLink>
    {origin && event.code && <EventLink event={event} origin={origin} path={thanksPath(event)} label="Tautan terima kasih" hint="Kirim ke tamu setelah kunjungan, bersama foto dan survei." />}
    <Notice>Unggah hanya foto yang boleh dilihat tamu.</Notice>
  </div>;
}
