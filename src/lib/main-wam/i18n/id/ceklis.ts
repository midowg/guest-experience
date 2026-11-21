/*
 * Ceklis persiapan (agen S1): the checklist of an agenda ("Persiapan berangkat"), its chips on Agenda,
 * the Persiapan (H-n) tab, the lock on Absen and Beranda's reminder. Keys `ceklis.*`; en/ceklis.ts holds
 * the same keys in English. Texts that admins write (the agenda, the items) are never in here.
 */
export const idCeklis = {
  "ceklis.heading": "Ceklis",
  "ceklis.progress": "Ceklis · {done} dari {total}",
  "ceklis.progressSr": "Ceklis, {done} dari {total} sudah dicentang",
  "ceklis.all": "Setuju semua",
  "ceklis.allBusy": "Mencentang…",
  "ceklis.ready": "Semua siap",
  "ceklis.required": "Wajib lengkap sebelum absen di agenda berikutnya.",
  "ceklis.reminder": "Pengingat dari panitia, tidak wajib dicentang.",
  "ceklis.saveFailed": "Belum tersimpan. Coba lagi.",
  "ceklis.photoOf": "Foto {text}",
  "ceklis.chip": "Ceklis {n}",
  "ceklis.chipFirst": "Ceklis dulu",
  "ceklis.tabPrep": "Persiapan",
  "ceklis.homeReminder": "Ceklis belum lengkap · {done} dari {total}",
  "ceklis.homeReminderOpen": "Buka ceklis",
  "absen.ceklisFirst": "Selesaikan ceklis dulu",
  "absen.ceklisBody": "Ceklis di {title} ({done}/{total}) harus lengkap sebelum absen.",
  "absen.ceklisOpen": "Buka ceklis",

  // What the server says (exactly as it writes it)
  "srv.ceklis.itemNotFound": "Item tidak ditemukan. Muat ulang ceklisnya.",
  "srv.ceklis.noChecklist": "Agenda ini tidak punya ceklis.",
  "srv.ceklis.cannotCheck": "Ceklis persiapan belum dapat diperiksa. Coba lagi sebentar.",
} as const;
