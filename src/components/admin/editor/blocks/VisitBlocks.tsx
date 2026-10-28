import { ImagePlus, MapPin, Trash2 } from "lucide-react";
import { Button, ButtonLink, Notice } from "@/components/ui";
import { Check, OrderButtons } from "@/components/admin/editor/controls";
import { moveItem } from "@/components/admin/editor/editor-model";
import { arrivalIconComponents } from "@/components/guest/VisitRoute";
import { arrivalIcons } from "@/lib/validation";
import { officeArrivalPoints } from "@/lib/visit-template";
import type { ArrivalIcon, ArrivalPoint } from "@/lib/types";
import type { EditorKit } from "@/components/admin/editor/kit";
import { WERKUDARA_OFFICE } from "@/components/admin/editor/suggestions";
import { AfterBlock } from "@/components/admin/editor/JourneyEditor";
import { adminEventPath, arrivalPath, thanksPath } from "@/lib/routes";
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

/** What the icons mean, for the radio labels the admin hears. */
const arrivalIconNames: Record<ArrivalIcon, string> = { door: "Pintu masuk", pin: "Titik temu", parking: "Parkir", clock: "Waktu", info: "Info", coffee: "Ruang tunggu" };

/**
 * Info kedatangan, under the turns on the guest's "Cara datang" screen: short facts beside an
 * icon (the lobby, where to wait, parking). Office visits only; at most four.
 */
export function ArrivalPointsBlock({ kit }: { kit: EditorKit }) {
  const { event, update, control } = kit;
  const points = event.route.points ?? [];
  const set = (next: ArrivalPoint[]) => update("route", { ...event.route, points: next });
  const change = (index: number, patch: Partial<ArrivalPoint>) => set(points.map((point, i) => i === index ? { ...point, ...patch } : point));
  return <div className="stack">
    {event.code && event.event_kind === "kunjungan" && <EventLink event={event} origin={kit.origin} path={arrivalPath(event)} label="Tautan panduan datang" hint="Halaman berisi Cara datang saja (peta, rute, info kedatangan, pendamping, Google Maps). Kirim ke tamu lewat WhatsApp sehari sebelum kunjungan." />}
    <h3>Info kedatangan</h3>
    <p className="field-hint">Tampil di bawah langkah rute dan kontak pendamping: apa yang tamu lakukan begitu sampai. Maksimal 4.</p>
    {points.map((point, index) => <div className={styles.item} key={index}>
      <div className={styles.itemHeader}><h4>Info {index + 1}</h4><OrderButtons label={`info ${index + 1}`} index={index} length={points.length} onMove={direction => set(moveItem(points, index, direction))} /></div>
      <fieldset className={styles.iconSet}><legend>Ikon</legend><div className={styles.iconRow}>{arrivalIcons.map(icon => {
        const Icon = arrivalIconComponents[icon];
        return <label key={icon} className={`${styles.iconChoice} ${point.icon === icon ? styles.iconChoiceOn : ""}`.trimEnd()}>
          <input type="radio" name={`route.points.${index}.icon`} value={icon} checked={point.icon === icon} onChange={() => change(index, { icon })} className="sr-only" />
          <Icon size={20} aria-hidden="true" /><span className="sr-only">{arrivalIconNames[icon]}</span>
        </label>;
      })}</div></fieldset>
      {control(`route.points.${index}.title`, "Judul", point.title, title => change(index, { title }), { maxLength: 120, hint: "Contoh: Lobi & resepsionis." })}
      {control(`route.points.${index}.description`, "Keterangan (opsional)", point.description, description => change(index, { description }), { maxLength: 300 })}
      <Button type="button" variant="danger" onClick={() => set(points.filter((_, i) => i !== index))}><Trash2 size={17} aria-hidden="true" /><span>Hapus info {index + 1}</span></Button>
    </div>)}
    <div className={styles.chips}>
      <Button type="button" variant="secondary" disabled={points.length >= 4} onClick={() => set([...points, { icon: "info", title: "", description: "" }])}>Tambah info</Button>
      {points.length === 0 && <Button type="button" variant="quiet" onClick={() => set(officeArrivalPoints)}>Pakai contoh: lobi & titik temu</Button>}
    </div>
  </div>;
}
