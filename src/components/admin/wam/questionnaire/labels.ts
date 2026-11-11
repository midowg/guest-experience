import type { FormStatus, QuestionKind, Visibility } from "@/lib/pra-wam/questionnaire";

/** The question kinds in the editor's words, in the order the picker lists them. */
export const kindLabels: Record<QuestionKind, string> = {
  text: "Isian singkat",
  long: "Isian panjang",
  single: "Pilih satu",
  multi: "Pilih beberapa",
  consent: "Persetujuan (centang)",
  matrix: "Matriks (baris × skala)",
  department: "Departemen (dari Data karyawan)",
  person: "Pilih rekan (dari Data karyawan)",
};

/** Who reads the answer, short, for the pill on a question row; the participant's words are visibilityLabels. */
export const visibilityShort: Record<Visibility, string> = {
  rekan: "Rekan",
  fasil: "Panitia",
  hr: "HR",
  hronly: "Rahasia",
  pilih: "Pilihan peserta",
  anon: "Anonim",
};

/** For the admin, what each read level means. */
export const visibilityHelp: Record<Visibility, string> = {
  rekan: "Semua peserta, di profil orang itu.",
  fasil: "Panitia di aplikasi (dengan nama), HR, dan semua admin WAM.",
  hr: "HR, manajemen, dan semua admin WAM (Rekap). Panitia di aplikasi hanya melihat jumlahnya; panitia kamar hanya hasil pairing.",
  hronly: "HR dan semua admin WAM (Rekap); tidak tampil ke panitia atau BOD di aplikasi.",
  pilih: "Sesuai pilihan peserta di bagian itu: dengan nama, tanpa nama, atau hanya fasilitator.",
  anon: "Tidak ada yang melihat per orang; hanya rangkuman. Hanya untuk bagian anonim.",
};

export const statusLabels: Record<FormStatus, string> = { draf: "Draf", buka: "Dibuka", tutup: "Ditutup" };
export const statusHelp: Record<FormStatus, string> = {
  draf: "Belum terlihat peserta. Aman untuk menyusun isi.",
  buka: "Tampil di Beranda peserta (semua, atau yang dipilih di Untuk siapa) dan bisa diisi.",
  tutup: "Tidak bisa diisi lagi. Jawaban yang ada tetap tersimpan.",
};
