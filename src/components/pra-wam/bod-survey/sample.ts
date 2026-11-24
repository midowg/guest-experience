import type { FillState, SurveyData, SurveyPerson, SurveyQuestion } from "./types";

/*
 * Made-up data for /dev-preview/kuesioner-bod: invented names and answers, nobody real (the
 * repository is public).
 */

const first = ["Adit", "Bunga", "Cahyo", "Dinda", "Eka", "Fajar", "Gita", "Hana", "Indra", "Joko", "Kirana", "Laras", "Mega", "Nanda", "Oki", "Putri", "Raka", "Sekar", "Tegar", "Utami"];
const last = ["Pratama", "Lestari", "Wibowo", "Maharani", "Saputra", "Anggraini", "Nugroho", "Puspita", "Setiawan", "Rahayu"];
const departments = ["Creative", "Finance", "HR", "IT", "Operations", "Sales & Marketing", "Production", "Event", "Legal", "Procurement", "Design", "Content"];

const sections = [
  { id: "s1", title: "Tentang kamu" },
  { id: "s2", title: "Harapan untuk WAM" },
  { id: "s3", title: "Kesejahteraan" },
  { id: "s4", title: "Masukan tanpa nama", anonymous: true },
];

const questions: SurveyQuestion[] = [
  { key: "hobi", number: 1, prompt: "Kegiatan favorit di luar kerja", sectionId: "s1", level: "rekan", answered: 44, kind: "pilihan", multi: true,
    options: [{ label: "Olahraga", count: 21 }, { label: "Musik", count: 17 }, { label: "Kuliner", count: 15 }, { label: "Jalan-jalan", count: 12 }, { label: "Gim", count: 9 }, { label: "Lainnya", count: 6 }] },
  { key: "kaos", number: 2, prompt: "Ukuran kaos", sectionId: "s1", level: "fasil", answered: 44, kind: "pilihan", multi: false,
    options: [{ label: "S", count: 6 }, { label: "M", count: 15 }, { label: "L", count: 14 }, { label: "XL", count: 7 }, { label: "XXL", count: 2 }] },
  { key: "harapan", number: 3, prompt: "Yang paling kamu harapkan dari WAM", sectionId: "s2", level: "rekan", answered: 41, kind: "pilihan", multi: false,
    options: [{ label: "Kenal rekan lintas tim", count: 16 }, { label: "Arah perusahaan tahun depan", count: 12 }, { label: "Belajar hal baru", count: 8 }, { label: "Istirahat dan rekreasi", count: 5 }] },
  { key: "momen", number: 4, prompt: "Satu momen kerja paling berkesan tahun ini", sectionId: "s2", level: "rekan", answered: 39, kind: "teks",
    samples: ["Waktu event klien di Bali selesai tepat waktu walau hujan seharian.", "Pertama kali memimpin rapat persiapan sendiri.", "Tim kecil kami menyelesaikan proposal dalam dua hari."] },
  { key: "seimbang", number: 5, prompt: "Seberapa seimbang kerja dan hidupmu bulan ini?", sectionId: "s3", level: "hr", answered: 40, kind: "skala", low: "Tidak seimbang", high: "Sangat seimbang", counts: [3, 7, 14, 11, 5] },
  { key: "rahasia", number: 6, prompt: "Hal yang ingin kamu sampaikan langsung ke HR", sectionId: "s3", level: "hronly", answered: 17, kind: "teks",
    samples: ["Ingin ada jadwal lembur yang lebih jelas saat musim event.", "Butuh pelatihan untuk alat desain yang baru."] },
  { key: "perbaiki", number: 7, prompt: "Satu hal yang perlu diperbaiki di kantor", sectionId: "s4", level: "anon", answered: 36, kind: "teks",
    samples: ["Koordinasi antardivisi sebelum event besar.", "Ruang rapat sering penuh di hari Senin.", "Informasi cuti lebih cepat diumumkan."] },
];

const stateOf = (i: number): FillState => i % 7 === 3 || i % 11 === 5 ? "belum" : i % 5 === 2 ? "mengisi" : "selesai";
const people: SurveyPerson[] = Array.from({ length: 57 }, (_, i) => {
  const state = stateOf(i);
  const done = state === "selesai" ? 3 : state === "mengisi" ? 1 + (i % 2) : 0;
  const answers: SurveyPerson["sections"] = [
    { title: "Tentang kamu", answers: [{ prompt: "Kegiatan favorit di luar kerja", answer: ["Olahraga, Musik", "Kuliner", "Jalan-jalan, Kuliner", "Gim"][i % 4], level: "rekan" }, { prompt: "Ukuran kaos", answer: ["M", "L", "S", "XL"][i % 4], level: "fasil" }] },
    { title: "Harapan untuk WAM", answers: [{ prompt: "Yang paling kamu harapkan dari WAM", answer: ["Kenal rekan lintas tim", "Arah perusahaan tahun depan", "Belajar hal baru"][i % 3], level: "rekan" }, { prompt: "Satu momen kerja paling berkesan tahun ini", answer: questions[3].kind === "teks" ? questions[3].samples[i % 3] : "", level: "rekan" }] },
    { title: "Kesejahteraan", answers: [{ prompt: "Seberapa seimbang kerja dan hidupmu bulan ini?", answer: `${1 + (i % 5)} dari 5`, level: "hr" }, ...(i % 3 === 0 ? [{ prompt: "Hal yang ingin kamu sampaikan langsung ke HR", answer: "Ingin ada jadwal lembur yang lebih jelas saat musim event.", level: "hronly" as const }] : [])] },
  ];
  return {
    id: `p${i}`, name: `${first[i % first.length]} ${last[(i * 3) % last.length]}`, department: departments[i % departments.length],
    state, sectionsDone: done, sectionsTotal: 3, lastActivity: state === "belum" ? null : new Date(Date.UTC(2026, 10, 18 + (i % 6), 2 + (i % 8), (i * 7) % 60)).toISOString(),
    sections: answers.slice(0, done),
  };
});

export const SAMPLE_SURVEY: SurveyData = {
  formName: "Kuesioner personal WAM 2026", updatedAt: "2026-11-24T02:42:00Z", closesAt: "2026-11-30T16:59:00Z",
  sections, questions, people,
};
