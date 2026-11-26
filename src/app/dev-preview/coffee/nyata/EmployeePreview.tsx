"use client";

import { useState } from "react";
import { CoffeeApp } from "@/components/coffee/CoffeeApp";
import css from "@/components/coffee/coffee.module.css";
import { createSampleCoffee } from "@/components/coffee/sample";
import { MONTHLY_QUOTA, type QuotaGroup } from "@/lib/coffee/menu";
import type { PhoneKind } from "@/lib/coffee/setup";
import type { CoffeeTab } from "@/lib/coffee/tabs";

const HERE = "/dev-preview/coffee/nyata";

/** The real app on the make-believe server, with a box that plays the other people: the pengelola who processes, and a network that goes away. */
export function EmployeePreview({ group, full, history, access, tab, setup, push, phone, note }: {
  group: QuotaGroup; full: boolean; history: boolean; access: boolean; tab: CoffeeTab; setup: boolean; push: boolean; phone: PhoneKind; note?: string;
}) {
  const [server] = useState(() => createSampleCoffee({ group, used: full ? MONTHLY_QUOTA[group] : history ? 2 : 0, ga: access, pengelola: access }));
  const [initial] = useState(() => server.initial());
  const [said, setSaid] = useState("Data contoh, tidak tersimpan.");
  const [offline, setOffline] = useState(false);
  const later = "Tampil di aplikasi saat status dibaca lagi (paling lama 15 detik).";
  const tools = (
    <details className={css.preview}>
      <summary>Pratinjau</summary>
      <div className={css.previewBody}>
        <p role="status">{said}</p>
        <button type="button" onClick={() => setSaid(server.settle("selesai") ? `Pengelola menekan Selesai. ${later}` : "Tidak ada pengajuan yang menunggu. Ajukan minuman dulu.")}>Pengelola: Selesai diproses</button>
        <button type="button" onClick={() => setSaid(server.settle("ditolak") ? `Pengelola menolak dengan catatan. ${later}` : "Tidak ada pengajuan yang menunggu. Ajukan minuman dulu.")}>Pengelola: Tolak dengan catatan</button>
        <button type="button" onClick={() => { server.recordManual(); setSaid("Pengelola mencatat satu klaim manual. Tampil saat aplikasi dibuka lagi (pindah tab browser lalu kembali)."); }}>Pengelola: Catat manual</button>
        <button type="button" aria-pressed={offline} onClick={() => { server.setOffline(!offline); setOffline(!offline); setSaid(offline ? "Jaringan tersambung lagi." : "Jaringan diputus: ajukan atau batalkan untuk melihat pesannya."); }}>{offline ? "Sambungkan jaringan" : "Putuskan jaringan"}</button>
        <a href={HERE}>Karyawan · 4×</a>
        <a href={`${HERE}?sebagai=ga`}>Tim GA · 2×</a>
        <a href={`${HERE}?sebagai=intern&riwayat=1`}>Intern · 2× (jatah habis)</a>
        <a href={`${HERE}?habis=1&akses=1`}>Jatah habis + akses GA/pengelola</a>
        <a href={`${HERE}?layar=atur`}>Atur sekali</a>
        <a href={`${HERE}?layar=masuk`}>Masuk</a>
        <a href={`${HERE}?layar=tunggu`}>Belum dibuka (menunggu migrasi)</a>
      </div>
    </details>
  );
  return <CoffeeApp initial={initial} api={server.api} tab={tab} routing="memory" setup={setup} phone={phone} note={note}
    notify={push ? { allow: async () => "denied" } : undefined} tools={tools} />;
}
