"use client";

import { useState } from "react";
import { GaApp } from "@/components/coffee/ga/GaApp";
import { GaDenied } from "@/components/coffee/ga/GaAuth";
import css from "@/components/coffee/ga/ga.module.css";
import { SAMPLE_GA, createSampleGa } from "@/components/coffee/ga/sample";
import { PREVIEW_MENU } from "@/lib/coffee/fixtures";
import { samplePush } from "@/components/coffee/pushSample";
import { ALL_OPTIONS, NO_OPTIONS } from "@/lib/coffee/menu";
import type { CoffeePushState } from "@/lib/coffee/notify";

const HERE = "/dev-preview/coffee/nyata/ga";

/** The real tablet on the make-believe server, with a box that plays the other people: the pengelola who processes, and a network that goes away. */
const OPTIONS = {
  "": { tim: ALL_OPTIONS, tamu: ALL_OPTIONS },
  tanpa: { tim: NO_OPTIONS, tamu: NO_OPTIONS },
  "tamu-gula": { tim: ALL_OPTIONS, tamu: { ...NO_OPTIONS, gula: true } },
  "tim-tanpa": { tim: NO_OPTIONS, tamu: ALL_OPTIONS },
};

export function GaPreview({ empty, slow, pin, held, push, options, denied = false }: { empty: boolean; slow: boolean; pin: boolean; held: boolean; push: CoffeePushState; options: keyof typeof OPTIONS; denied?: boolean }) {
  const [port] = useState(() => samplePush(push));
  const [server] = useState(() => createSampleGa({ seeded: !empty, delay: slow ? 1500 : 0, pin: pin ? "1234" : "", options: OPTIONS[options], menu: PREVIEW_MENU }));
  // Loaded in guest mode: no GA data comes with the page, only the menu and the options, as on the real one.
  const [initial] = useState(() => held ? server.held() : server.initial());
  const [said, setSaid] = useState("Data contoh, tidak tersimpan.");
  const [offline, setOffline] = useState(false);
  const later = "Tampil di tablet saat status dibaca lagi (paling lama 15 detik).";
  const none = "Tidak ada pesanan yang menunggu. Kirim pesanan dulu.";
  const tools = (
    <details className={css.tools}>
      <summary>Pratinjau</summary>
      <div className={css.toolsBody}>
        <p role="status">{said}</p>
        <button type="button" onClick={() => { const order = server.settle("selesai"); setSaid(order ? `Pengelola menekan Selesai pada #${order.no}. ${later}` : none); }}>Pengelola: Selesai diproses</button>
        <button type="button" onClick={() => { const order = server.settle("ditolak"); setSaid(order ? `Pengelola menolak #${order.no} dengan catatan. ${later}` : none); }}>Pengelola: Tolak dengan catatan</button>
        <button type="button" aria-pressed={offline} onClick={() => { server.setOffline(!offline); setOffline(!offline); setSaid(offline ? "Jaringan tersambung lagi." : "Jaringan diputus: tekan Kirim untuk melihat pesannya."); }}>{offline ? "Sambungkan jaringan" : "Putuskan jaringan"}</button>
        <button type="button" onClick={() => { server.loseAnswers(1); setSaid("Jawaban Kirim berikutnya hilang di jalan: pesanannya sampai, tablet tidak diberi tahu."); }}>Jawaban berikutnya hilang</button>
        <button type="button" onClick={() => { server.hangNext(1); setSaid("Permintaan berikutnya menggantung: tablet menyerah setelah ±17 detik."); }}>Permintaan berikutnya menggantung</button>
        <a href={HERE}>Dua pesanan pagi ini</a>
        <a href={`${HERE}?pin=1`}>PIN GA sudah diatur (1234)</a>
        <a href={`${HERE}?opsi=tanpa`}>Opsi: tamu dan tim tanpa opsi</a>
        <a href={`${HERE}?opsi=tamu-gula`}>Opsi: tamu gula saja</a>
        <a href={`${HERE}?opsi=tim-tanpa`}>Opsi: tim tanpa opsi</a>
        <a href={`${HERE}?kosong=1`}>Belum ada pesanan</a>
        <a href={`${HERE}?lambat=1`}>Jaringan lambat (1,5 detik)</a>
        <a href={`${HERE}?notif=on`}>Notifikasi aktif</a>
        <a href={`${HERE}?notif=denied`}>Notifikasi diblokir</a>
        <a href={`${HERE}?layar=ditolak`}>Masuk tanpa akses Mode GA</a>
      </div>
    </details>
  );
  // Signed in without Mode GA, as the tablet's sign-in page draws it; Keluar ends nothing here.
  if (denied) return <GaDenied name="Rina (contoh)" signOut={async () => undefined} push={null} />;
  return <GaApp initial={initial} me={{ name: SAMPLE_GA }} api={server.api} held={held} push={port} tools={tools} />;
}
