import { MAIN_WAM_MODULES, type MainWamModule, type ModuleSwitches } from "./types";

/*
 * The modules an admin switches on (Admin WAM → Main WAM → Pengaturan). A module that is off leaves
 * no trace: no Beranda card, no action in a session, no row in BOD's Ringkasan, its pages 404 and
 * its APIs refuse (gate.ts requireModule). Pure.
 */

/**
 * Every module is off until an admin switches it on (DEFAULT_MODULES, settings.ts). Silent Meeting is the
 * one the owner left out of WAM: it belongs to Pra WAM, so it stays off here unless the event uses it
 * (`note` is shown with its switch in Admin WAM → Main WAM → Pengaturan).
 */
export const moduleInfo: Record<MainWamModule, { label: string; hint: string; note?: string }> = {
  absen: { label: "Absen QR", hint: "Scan QR di sesi yang ditandai pakai absen; panitia bisa mencatat manual." },
  voting: { label: "Voting Awarding", hint: "Kartu Beranda saat voting dibuka, aksi di sesi Awarding, persetujuan BOD." },
  silent: { label: "Silent Meeting", hint: "Masukan tanpa nama, dibuka dan ditutup mengikuti jam sesinya.", note: "Silent Meeting dipakai di Pra WAM; nyalakan hanya bila acara WAM memang memakainya." },
  survei: { label: "Survei", hint: "Kartu Beranda yang menaut ke kuesioner yang dipilih." },
  mozaik: { label: "Mozaik", hint: "Tombol Mozaik di Momen: foto untuk semua menyusun tulisan acara." },
  karbon: { label: "Jejak karbon", hint: "Kartu di Beranda, baris di Saya dan Ringkasan BOD, dan halaman rinciannya; angka dihitung dari data acara." },
  ceklis: { label: "Ceklis persiapan", hint: "Daftar yang dicentang peserta per agenda (mis. Persiapan berangkat), tab H-n di Agenda, dan syarat ceklis lengkap sebelum absen." },
};

export const moduleOn = (modules: ModuleSwitches, key: MainWamModule) => modules[key] === true;

/** The modules that are on, in the fixed order. */
export const activeModules = (modules: ModuleSwitches): MainWamModule[] => MAIN_WAM_MODULES.filter(key => modules[key]);

/** "Absen QR, Mozaik" or "Belum ada modul". */
export function activeModulesLabel(modules: ModuleSwitches): string {
  const on = activeModules(modules);
  return on.length ? on.map(key => moduleInfo[key].label).join(", ") : "Belum ada modul";
}
