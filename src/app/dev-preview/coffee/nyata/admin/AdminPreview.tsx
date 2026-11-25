"use client";

import { useState } from "react";
import { CoffeeAdminApp } from "@/components/coffee-admin/CoffeeAdminApp";
import css from "@/components/coffee-admin/coffee-admin.module.css";
import { SAMPLE_ACTOR, createSampleServer } from "@/components/coffee-admin/sample";
import type { CoffeeAdminSectionKey } from "@/components/coffee-admin/sections";

/** The real screen on the make-believe server, with two buttons that play the other people: an employee who claims, and a second pengelola. */
export function AdminPreview({ view, now, routing }: { view: CoffeeAdminSectionKey; now: string; routing: "history" | "memory" }) {
  const [server] = useState(() => createSampleServer());
  const [note, setNote] = useState("Data contoh, tidak tersimpan.");
  const tools = (
    <div className={css.preview}>
      <strong>Pratinjau</strong>
      <span className={css.grow} role="status">{note}</span>
      <button type="button" className={css.secondary} onClick={() => setNote(server.addClaim() ? "Klaim contoh masuk; tampil saat antrean dibaca lagi (paling lama 10 detik)." : "Semua jatah contoh bulan ini sudah terpakai.")}>Tambah klaim contoh</button>
      <button type="button" className={css.secondary} onClick={() => setNote(server.processElsewhere() ? "Pesanan teratas diproses pengelola lain. Tekan Selesai pada kartunya sebelum antrean dibaca lagi untuk melihat penolakannya." : "Tidak ada pesanan yang menunggu.")}>Proses pesanan teratas di jendela lain</button>
    </div>
  );
  return <CoffeeAdminApp view={view} now={now} personName={SAMPLE_ACTOR.name} api={server.api} routing={routing} tools={tools} />;
}
