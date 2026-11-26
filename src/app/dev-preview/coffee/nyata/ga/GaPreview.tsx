"use client";

import { useState } from "react";
import { GaApp } from "@/components/coffee/ga/GaApp";
import css from "@/components/coffee/ga/ga.module.css";
import { SAMPLE_GA, createSampleGa } from "@/components/coffee/ga/sample";

const HERE = "/dev-preview/coffee/nyata/ga";

/** The real tablet on the make-believe server, with a box that plays the other people: the pengelola who processes, and a network that goes away. */
export function GaPreview({ empty, slow }: { empty: boolean; slow: boolean }) {
  const [server] = useState(() => createSampleGa({ seeded: !empty, delay: slow ? 1500 : 0 }));
  const [initial] = useState(() => server.initial());
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
        <a href={HERE}>Dua pesanan pagi ini</a>
        <a href={`${HERE}?kosong=1`}>Belum ada pesanan</a>
        <a href={`${HERE}?lambat=1`}>Jaringan lambat (1,5 detik)</a>
      </div>
    </details>
  );
  return <GaApp initial={initial} me={{ name: SAMPLE_GA }} api={server.api} tools={tools} />;
}
