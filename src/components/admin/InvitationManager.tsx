"use client";

import { useState, type FormEvent } from "react";
import { Button, Notice } from "@/components/ui";
import type { EventRecord } from "@/lib/types";
import type { EventInvitation } from "@/lib/server/invitations";
import { adminRequest, errorMessage } from "./api";

export function InvitationManager({ event, initial }: { event: EventRecord; initial: EventInvitation[] }) {
  const [items, setItems] = useState(initial);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const base = `/api/admin/events/${event.id}/invitations`;
  async function create(e: FormEvent) {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await adminRequest<EventInvitation>(base, { method: "POST", body: JSON.stringify({ name }) });
      if (!result.data) throw new Error("Missing invitation");
      setItems(current => [...current, result.data!]); setName(""); setMessage("Undangan baru dibuat.");
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  async function update(item: EventInvitation, action: "rename" | "revoke" | "rotate") {
    if (busy) return;
    let nextName: string | null = null;
    if (action === "rename") {
      nextName = window.prompt("Nama sapaan tamu", item.name);
      if (nextName === null) return;
      nextName = nextName.trim();
      if (!nextName || nextName.length > 150) { setError("Nama sapaan harus berisi 1–150 karakter."); return; }
    }
    if (action === "revoke" && !window.confirm("Cabut tautan ini? Tamu tidak dapat membuka halaman atau memperbarui RSVP melalui tautan lama.")) return;
    if (action === "rotate" && !window.confirm("Terbitkan tautan baru? Tautan lama langsung tidak berlaku; RSVP tersimpan tetap ada.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await adminRequest<EventInvitation>(`${base}/${item.id}`, { method: "PATCH", body: JSON.stringify({ action, ...(nextName !== null ? { name: nextName } : {}) }) });
      if (!result.data) throw new Error("Missing invitation");
      setItems(current => current.map(row => row.id === item.id ? result.data! : row)); setMessage("Undangan diperbarui.");
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  async function copy(item: EventInvitation) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/e/${encodeURIComponent(event.slug)}/i/${item.token}`);
      setMessage(`Tautan ${item.name} disalin.`); setError("");
    } catch { setError("Tautan tidak dapat disalin otomatis. Periksa izin clipboard browser."); }
  }
  return <div className="stack">
    <Notice tone="warning">Panel admin belum memakai login: siapa pun yang membuka domain dapat melihat daftar dan tautan ini, serta memakai tautan untuk melihat atau mengubah RSVP. Tautan personal bukan bukti identitas. Jangan bagikan daftar tautan secara terbuka.</Notice>
    {event.invitation_mode !== "personal" && <Notice>Mode acara masih tautan umum. Ubah ke “Tautan per tamu” di editor dan simpan agar tautan individual dapat dibuka.</Notice>}
    {error && <Notice tone="error" role="alert">{error}</Notice>}
    {message && <p role="status">{message}</p>}
    <form onSubmit={create} className="stack"><label htmlFor="invitee-name">Nama sapaan tamu</label><input id="invitee-name" className="input" value={name} onChange={e => setName(e.target.value)} maxLength={150} required /><Button type="submit" disabled={busy || items.length >= 1000}>Tambah undangan</Button></form>
    <p>{items.length} undangan tersimpan (maksimal 1000). Nama dan token tidak masuk ke halaman acara umum.</p>
    <ul className="stack">{items.map(item => <li key={item.id} className="stack">
      <strong>{item.name}</strong><span>{item.active ? "Tautan aktif" : "Tautan dicabut"} · {item.rsvp ? `RSVP: ${item.rsvp.attendance === "yes" ? "Hadir" : "Tidak hadir"}` : "Belum menjawab"}</span>
      <div className="stack"><Button type="button" variant="secondary" disabled={busy || !item.active} onClick={() => copy(item)}>Salin tautan</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => update(item, "rename")}>Ubah sapaan</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => update(item, "rotate")}>Terbitkan tautan baru</Button><Button type="button" variant="danger" disabled={busy || !item.active} onClick={() => update(item, "revoke")}>Cabut tautan</Button></div>
    </li>)}</ul>
  </div>;
}
