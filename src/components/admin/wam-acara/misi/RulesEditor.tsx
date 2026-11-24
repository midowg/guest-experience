"use client";

import { useId } from "react";
import { TAG_MAX, TAG_RELATIONS, type MissionRule, type TagRelation } from "@/lib/main-wam/misi/rules";
import { wibDate, wibTime } from "@/lib/main-wam/rundown";
import css from "./misi-admin.module.css";

/*
 * The TNC form of one photo mission (Admin WAM → Misi): one block per rule. The draft keeps every field
 * as text, as typed; draftToRules turns it into rules (the server's zod schema then says what is wrong).
 * Admin WAM stays Indonesian.
 */

export type RulesDraft = {
  lokasi: boolean; placeName: string; latitude: string; longitude: string; radiusM: string;
  tag: boolean; tagCount: string; tagRelation: TagRelation; tagRequired: boolean;
  pose: boolean; poseLabel: string; poseText: string;
  waktu: boolean; start: string; end: string;
  batas: string;
};

export const RELATION_WORDS: Record<TagRelation, string> = {
  bod: "BOD", sebangku: "Teman sebangku di kereta", sekamar: "Teman sekamar", departemen_lain: "Rekan dari departemen lain", siapa_saja: "Siapa saja (peserta acara)",
};

/** "2027-01-06T08:00" (WIB, for <input type="datetime-local">) ↔ an ISO instant. */
const toLocal = (iso: string | null) => (iso ? `${wibDate(iso)}T${wibTime(iso)}` : "");
const fromLocal = (value: string) => (value ? `${value}:00+07:00` : null);

export const emptyDraft = (): RulesDraft => ({
  lokasi: false, placeName: "", latitude: "", longitude: "", radiusM: "100",
  tag: false, tagCount: "1", tagRelation: "siapa_saja", tagRequired: true,
  pose: false, poseLabel: "", poseText: "",
  waktu: false, start: "", end: "",
  batas: "3",
});

export function rulesToDraft(rules: readonly MissionRule[]): RulesDraft {
  const draft = emptyDraft();
  draft.batas = "";
  for (const rule of rules) {
    if (rule.type === "lokasi") Object.assign(draft, { lokasi: true, placeName: rule.name, latitude: String(rule.latitude), longitude: String(rule.longitude), radiusM: String(rule.radiusM) });
    if (rule.type === "tag") Object.assign(draft, { tag: true, tagCount: String(rule.count), tagRelation: rule.relation, tagRequired: rule.required });
    if (rule.type === "pose") Object.assign(draft, { pose: true, poseLabel: rule.label, poseText: rule.text });
    if (rule.type === "waktu") Object.assign(draft, { waktu: true, start: toLocal(rule.start), end: toLocal(rule.end) });
    if (rule.type === "batas_kali") draft.batas = String(rule.times);
  }
  return draft;
}

const num = (text: string) => (text.trim() === "" ? Number.NaN : Number(text.replace(",", ".")));

/** The rules a draft says (a photo mission always has the live camera). Numbers that are not numbers stay NaN, so the schema refuses them. */
export function draftToRules(draft: RulesDraft): MissionRule[] {
  const rules: MissionRule[] = [{ type: "foto_langsung" }];
  if (draft.lokasi) rules.push({ type: "lokasi", name: draft.placeName, latitude: num(draft.latitude), longitude: num(draft.longitude), radiusM: num(draft.radiusM) });
  if (draft.tag) rules.push({ type: "tag", count: num(draft.tagCount), relation: draft.tagRelation, required: draft.tagRequired });
  if (draft.pose) rules.push({ type: "pose", label: draft.poseLabel, text: draft.poseText });
  if (draft.waktu) rules.push({ type: "waktu", start: fromLocal(draft.start), end: fromLocal(draft.end) });
  if (draft.batas.trim() !== "") rules.push({ type: "batas_kali", times: num(draft.batas) });
  return rules;
}

export function RulesEditor({ draft, onChange }: { draft: RulesDraft; onChange: (draft: RulesDraft) => void }) {
  const id = useId();
  const set = <K extends keyof RulesDraft>(key: K, value: RulesDraft[K]) => onChange({ ...draft, [key]: value });
  return <fieldset className={css.rules}>
    <legend>Syarat dan ketentuan (TNC)</legend>
    <p className={css.small}>Foto langsung dari kamera aplikasi (tanpa galeri, lokasi aktif) selalu berlaku. Aturan di bawah tampil sebagai label di kartu misi dan daftar di lembar misi. Yang bisa dicek sistem (lokasi, tag, waktu, batas kirim) dicek otomatis; pose dan benda dinilai pemeriksa.</p>

    <div className={css.rule}>
      <label className={css.check}><input type="checkbox" checked={draft.lokasi} onChange={event => set("lokasi", event.target.checked)} />Harus di lokasi tertentu</label>
      {draft.lokasi && <div className={css.formGrid}>
        <div className="field"><label htmlFor={`${id}-tempat`}>Nama tempat</label><input id={`${id}-tempat`} className="input" maxLength={100} value={draft.placeName} onChange={event => set("placeName", event.target.value)} placeholder="Jatim Park, Batu" /></div>
        <div className="field"><label htmlFor={`${id}-lat`}>Garis lintang</label><input id={`${id}-lat`} className="input" inputMode="decimal" value={draft.latitude} onChange={event => set("latitude", event.target.value)} placeholder="-7.88560" /></div>
        <div className="field"><label htmlFor={`${id}-lng`}>Garis bujur</label><input id={`${id}-lng`} className="input" inputMode="decimal" value={draft.longitude} onChange={event => set("longitude", event.target.value)} placeholder="112.52960" /></div>
        <div className="field"><label htmlFor={`${id}-radius`}>Radius (m)</label><input id={`${id}-radius`} className="input" inputMode="numeric" value={draft.radiusM} onChange={event => set("radiusM", event.target.value)} /></div>
      </div>}
    </div>

    <div className={css.rule}>
      <label className={css.check}><input type="checkbox" checked={draft.tag} onChange={event => set("tag", event.target.checked)} />Menandai orang di foto</label>
      {draft.tag && <>
        <div className={css.formGrid}>
          <div className="field"><label htmlFor={`${id}-jumlah`}>Jumlah orang</label><input id={`${id}-jumlah`} className="input" type="number" min={1} max={TAG_MAX} value={draft.tagCount} onChange={event => set("tagCount", event.target.value)} /></div>
          <div className="field"><label htmlFor={`${id}-hubungan`}>Siapa yang ditandai</label>
            <select id={`${id}-hubungan`} className="select" value={draft.tagRelation} onChange={event => set("tagRelation", event.target.value as TagRelation)}>
              {TAG_RELATIONS.map(relation => <option key={relation} value={relation}>{RELATION_WORDS[relation]}</option>)}
            </select></div>
        </div>
        <label className={css.check}><input type="checkbox" checked={draft.tagRequired} onChange={event => set("tagRequired", event.target.checked)} />Wajib (bila mati: boleh menandai sampai jumlah itu, tidak wajib)</label>
      </>}
    </div>

    <div className={css.rule}>
      <label className={css.check}><input type="checkbox" checked={draft.pose} onChange={event => set("pose", event.target.checked)} />Pose atau benda yang harus tampak</label>
      {draft.pose && <div className={css.formGrid}>
        <div className="field"><label htmlFor={`${id}-label`}>Label singkat</label><input id={`${id}-label`} className="input" maxLength={40} value={draft.poseLabel} onChange={event => set("poseLabel", event.target.value)} placeholder="Pose plank" /></div>
        <div className="field"><label htmlFor={`${id}-pose`}>Apa yang harus tampak (dibaca pemeriksa)</label><input id={`${id}-pose`} className="input" maxLength={200} value={draft.poseText} onChange={event => set("poseText", event.target.value)} placeholder="Orang di foto dalam posisi plank, seluruh badan terlihat." /></div>
      </div>}
    </div>

    <div className={css.rule}>
      <label className={css.check}><input type="checkbox" checked={draft.waktu} onChange={event => set("waktu", event.target.checked)} />Hanya berlaku pada jam tertentu</label>
      {draft.waktu && <div className={css.formGrid}>
        <div className="field"><label htmlFor={`${id}-mulai`}>Mulai (WIB)</label><input id={`${id}-mulai`} className="input" type="datetime-local" value={draft.start} onChange={event => set("start", event.target.value)} /></div>
        <div className="field"><label htmlFor={`${id}-akhir`}>Sampai (WIB)</label><input id={`${id}-akhir`} className="input" type="datetime-local" value={draft.end} onChange={event => set("end", event.target.value)} /></div>
      </div>}
    </div>

    <div className="field">
      <label htmlFor={`${id}-batas`}>Batas kirim per orang (kosong = tanpa batas)</label>
      <input id={`${id}-batas`} className="input" type="number" min={1} max={10} value={draft.batas} onChange={event => set("batas", event.target.value)} />
      <span className={css.small}>Foto yang ditolak juga dihitung satu kali kirim. Peserta hanya bisa kirim ulang selama batas belum tercapai.</span>
    </div>
  </fieldset>;
}
