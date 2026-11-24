import type { BodPersonAnswers, BodSurvey, BodSurveyPerson, FillState } from "@/lib/pra-wam/bod-survey";
import type { BodSurveyClient } from "./BodSurvey";

/*
 * Made-up data for /dev-preview/kuesioner-bod: invented names and answers, nobody real (the
 * repository is public).
 */

const first = ["Adit", "Bunga", "Cahyo", "Dinda", "Eka", "Fajar", "Gita", "Hana", "Indra", "Joko", "Kirana", "Laras", "Mega", "Nanda", "Oki", "Putri", "Raka", "Sekar", "Tegar", "Utami"];
const last = ["Pratama", "Lestari", "Wibowo", "Maharani", "Saputra", "Anggraini", "Nugroho", "Puspita", "Setiawan", "Rahayu"];
const departments = ["Creative", "Finance", "HR", "IT", "Operations", "Sales & Marketing", "Production", "Event", "Legal", "Procurement", "Design", "Content"];

const stateOf = (i: number): FillState => i % 7 === 3 || i % 11 === 5 ? "belum" : i % 5 === 2 ? "sedang" : "selesai";
const people: BodSurveyPerson[] = Array.from({ length: 57 }, (_, i) => {
  const state = stateOf(i);
  return {
    employeeId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, name: `${first[i % first.length]} ${last[(i * 3) % last.length]}`,
    department: departments[i % departments.length], state, sectionsDone: state === "selesai" ? 3 : state === "sedang" ? 1 + (i % 2) : 0, sectionsTotal: 3,
    lastActivity: state === "belum" ? null : new Date(Date.UTC(2026, 10, 18 + (i % 6), 2 + (i % 8), (i * 7) % 60)).toISOString(),
  };
}).sort((a, b) => a.name.localeCompare(b.name, "id"));

const count = (state: FillState) => people.filter(person => person.state === state).length;
const tally = (list: BodSurveyPerson[]) => ({ selesai: list.filter(p => p.state === "selesai").length, sedang: list.filter(p => p.state === "sedang").length, belum: list.filter(p => p.state === "belum").length });

export const SAMPLE_BOD_SURVEY: BodSurvey = {
  formName: "Kuesioner personal WAM 2026", editUntil: "2026-11-30T16:59:00Z",
  counts: { selesai: count("selesai"), sedang: count("sedang"), belum: count("belum") },
  people,
  departments: departments.map(name => { const list = people.filter(person => person.department === name); return { name, counts: tally(list), total: list.length }; }),
  sections: [
    { key: "s1", title: "Tentang kamu", anonymous: false, items: [
      { key: "1", prompt: "Kegiatan favorit di luar kerja", kind: "multi", visibility: "rekan", answered: 44, several: true,
        body: { type: "bars", rest: 0, bars: [{ label: "Olahraga", count: 21 }, { label: "Musik", count: 17 }, { label: "Kuliner", count: 15 }, { label: "Jalan-jalan", count: 12 }, { label: "Gim", count: 9 }] } },
      { key: "2", prompt: "Ukuran kaos", kind: "single", visibility: "fasil", answered: 44, several: false,
        body: { type: "bars", rest: 0, bars: [{ label: "S", count: 6 }, { label: "M", count: 15 }, { label: "L", count: 14 }, { label: "XL", count: 7 }, { label: "XXL", count: 2 }] } },
    ] },
    { key: "s2", title: "Harapan untuk WAM", anonymous: false, items: [
      { key: "3", prompt: "Seberapa setuju kamu?", kind: "matrix", visibility: "rekan", answered: 41, several: false,
        body: { type: "matrix", scale: ["Tidak setuju", "Ragu", "Setuju", "Sangat setuju"], rows: [{ label: "WAM membantu kenal rekan lintas tim", counts: [2, 6, 18, 15] }, { label: "Arah perusahaan sudah jelas", counts: [5, 12, 17, 7] }] } },
      { key: "4", prompt: "Satu momen kerja paling berkesan tahun ini", kind: "long", visibility: "pilih", answered: 39, several: false,
        body: { type: "quotes", quotes: [{ text: "Waktu event klien di Bali selesai tepat waktu walau hujan seharian.", count: 1 }, { text: "Pertama kali memimpin rapat persiapan sendiri.", count: 1 }, { text: "Tim kecil kami menyelesaikan proposal dalam dua hari.", count: 2 }, { text: "Dapat mentor yang sabar di bulan pertama.", count: 1 }] } },
    ] },
    { key: "s3", title: "Kesejahteraan", anonymous: false, items: [
      { key: "5", prompt: "Seberapa seimbang kerja dan hidupmu bulan ini?", kind: "single", visibility: "hr", answered: 40, several: false,
        body: { type: "bars", rest: 0, bars: [{ label: "1 · Tidak seimbang", count: 3 }, { label: "2", count: 7 }, { label: "3", count: 14 }, { label: "4", count: 11 }, { label: "5 · Sangat seimbang", count: 5 }] } },
      { key: "6", prompt: "Hal yang ingin kamu sampaikan langsung ke HR", kind: "long", visibility: "hronly", answered: 17, several: false, body: { type: "needs-hr" } },
    ] },
    { key: "s4", title: "Masukan tanpa nama", anonymous: true, items: [
      { key: "7", prompt: "Satu hal yang perlu diperbaiki di kantor", kind: "long", visibility: "anon", answered: 36, several: false,
        body: { type: "quotes", quotes: [{ text: "Koordinasi antardivisi sebelum event besar.", count: 4 }, { text: "Ruang rapat sering penuh di hari Senin.", count: 2 }, { text: "Informasi cuti lebih cepat diumumkan.", count: 1 }] } },
      { key: "8", prompt: "Saran untuk acara malam", kind: "text", visibility: "anon", answered: 3, several: false, body: { type: "few" } },
    ] },
  ],
};

/** A stand-in server: each person's readable answers after a short wait, and an Excel file that is only a note. */
export const sampleBodClient: BodSurveyClient = {
  async person(employeeId): Promise<BodPersonAnswers> {
    await new Promise(resolve => setTimeout(resolve, 500));
    const person = people.find(item => item.employeeId === employeeId)!;
    const i = people.indexOf(person);
    return {
      name: person.name, department: person.department,
      sections: [
        { title: "Tentang kamu", answers: [{ prompt: "Kegiatan favorit di luar kerja", answer: ["Olahraga, Musik", "Kuliner", "Jalan-jalan, Kuliner", "Gim"][i % 4], level: "rekan" }] },
        { title: "Harapan untuk WAM", answers: [{ prompt: "Satu momen kerja paling berkesan tahun ini", answer: "Pertama kali memimpin rapat persiapan sendiri.", level: "pilih" }] },
        { title: "Kesejahteraan", answers: [{ prompt: "Seberapa seimbang kerja dan hidupmu bulan ini?", answer: String(1 + (i % 5)), level: "hr" }] },
      ].slice(0, person.sectionsDone) as BodPersonAnswers["sections"],
    };
  },
  async download(isi) {
    await new Promise(resolve => setTimeout(resolve, 900));
    return { blob: new Blob([`Contoh berkas ${isi}`], { type: "text/plain" }), name: `kuesioner-${isi}-bod-contoh.txt` };
  },
};
