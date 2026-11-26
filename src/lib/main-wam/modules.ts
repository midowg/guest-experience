import { MAIN_WAM_MODULES, type MainWamModule, type ModuleSwitches } from "./types";

/*
 * The modules an admin switches on (Admin WAM → Main WAM → Pengaturan). A module that is off leaves
 * no trace: no Beranda card, no action in a session, its pages 404 and
 * its APIs refuse (gate.ts requireModule). Pure.
 */

/**
 * Every module is off until an admin switches it on (DEFAULT_MODULES, settings.ts). Silent Meeting is the
 * one the owner left out of WAM: it belongs to Pra WAM, so it stays off here unless the event uses it
 * (`note` is shown with its switch in Admin WAM → Main WAM → Pengaturan).
 */
export const moduleInfo: Record<MainWamModule, { label: string; hint: string; note?: string }> = {
  absen: { label: "Absen wajah", hint: "Absen wajah di tablet; panitia bisa mencatat manual." },
  voting: { label: "Voting Awarding", hint: "Kartu Beranda saat voting dibuka, aksi di sesi Awarding, persetujuan BOD." },
  silent: { label: "Silent Meeting", hint: "Masukan tanpa nama, dibuka dan ditutup mengikuti jam sesinya.", note: "Silent Meeting dipakai di Pra WAM; nyalakan hanya bila acara WAM memang memakainya." },
  survei: { label: "Survei", hint: "Kartu Beranda yang menaut ke kuesioner yang dipilih." },
  mozaik: { label: "Mozaik", hint: "Tombol Mozaik di Momen: foto untuk semua menyusun tulisan acara." },
  misi: { label: "Misi dan poin", hint: "Kartu Misi di Beranda, halaman Misi dan Peringkat; misi foto, check-in lokasi, dan sesi bernilai poin." },
  karbon: { label: "Jejak karbon", hint: "Kartu di Beranda, baris di Saya, dan halaman rinciannya; angka dihitung dari data acara." },
  kuis: { label: "Kuis live", hint: "Kuis pilihan ganda bersama: soal di layar besar dan HP, peserta menjawab sebagai tokohnya. Kartu Beranda saat lobi dibuka; soal dan pengendali di Modul acara → Kuis." },
  ceklis: { label: "Ceklis persiapan", hint: "Daftar yang dicentang peserta per agenda (mis. Persiapan berangkat), tab H-n di Agenda, dan tombol Setuju semua. Hanya pengingat: tidak memengaruhi absen." },
};

/**
 * Modules hidden from the app (participants, panitia, BOD) for now, whatever their switch says (owner's request,
 * 24 Nov 2026: Silent Meeting belongs to Pra WAM, voting is not used at WAM yet). The app treats them as off
 * (readMainWamSettings applies appModules), so pages 404, APIs refuse, Beranda cards and session actions
 * vanish. Admin keeps them: it reads the saved switches (mainWamSettingsState). To bring them back, empty this list.
 */
export const APP_HIDDEN_MODULES: readonly MainWamModule[] = ["silent", "voting"];

/** The module switches as the app sees them: the saved ones with APP_HIDDEN_MODULES forced off. */
export function appModules(modules: ModuleSwitches): ModuleSwitches {
  return APP_HIDDEN_MODULES.length ? { ...modules, ...Object.fromEntries(APP_HIDDEN_MODULES.map(key => [key, false])) } : modules;
}

/** Shown beside the switch of a module in APP_HIDDEN_MODULES (Admin → Modul acara). */
export const APP_HIDDEN_NOTE = "Disembunyikan di aplikasi untuk sementara; pengaturan tetap bisa disiapkan di sini.";
export const appHidden = (key: MainWamModule) => APP_HIDDEN_MODULES.includes(key);

/**
 * The participant's own QR check-in (scan the printed session QR with the phone), hidden from the app on purpose
 * (owner, 26 Nov 2026, KONTRAK 41): attendance at WAM is ONLY the face scan on the panitia's tablet at the room door
 * (Absen mode tablet, KONTRAK 39), no printed QR and no paper list. With this `false` the participant sees no Absen
 * button (Beranda's Sekarang card, Detail sesi), the pages /absen and /absen/{token} and the APIs absen/{token} and
 * kelola/qr/{sesi} answer 404 (gated in gate.ts: requireQrAbsenPage, requireQrAbsenApi), the offline-scan runner is not
 * mounted, and panitia's "Tampilkan QR sesi" is gone. What stays: module Absen, "pakai absen" on a session, Absen mode
 * tablet, panitia's manual list, the attendance record, "Hadir 07.52" once recorded, and the 30-minute window.
 * No code of the QR flow was deleted. To bring it back (the tablet fails in the field): set this to `true`; nothing else.
 */
export const QR_ABSEN_VISIBLE = false;

export const moduleOn = (modules: ModuleSwitches, key: MainWamModule) => modules[key] === true;

/** The modules that are on, in the fixed order. */
export const activeModules = (modules: ModuleSwitches): MainWamModule[] => MAIN_WAM_MODULES.filter(key => modules[key]);

/** "Absen QR, Mozaik" or "Belum ada modul". */
export function activeModulesLabel(modules: ModuleSwitches): string {
  const on = activeModules(modules);
  return on.length ? on.map(key => moduleInfo[key].label).join(", ") : "Belum ada modul";
}
