"use client";

import { useState } from "react";
import { Crosshair, ExternalLink, Plus } from "lucide-react";
import { Notice } from "@/components/ui";
import { Card, ConsoleButton, ConsoleButtonLink, PageHeader, Pill } from "@/components/console";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { VIEWER_ZONES, type ViewerZone } from "@/lib/pra-wam/zone";
import { mapsLink, parseLatLng, type GeoPoint } from "@/lib/hr/geo";
import { hrAdminApi } from "@/lib/routes";
import css from "./hr-admin.module.css";

export type Office = { id: string; name: string; lat: number; lng: number; radiusM: number; zone: ViewerZone; active: boolean };
type Draft = { id: string | null; name: string; point: string; radiusM: string; zone: ViewerZone; active: boolean };
type Message = { tone: "success" | "error"; text: string } | null;

const empty: Draft = { id: null, name: "", point: "", radiusM: "100", zone: "WIB", active: true };
const draftOf = (office: Office): Draft => ({ id: office.id, name: office.name, point: `${office.lat}, ${office.lng}`, radiusM: String(office.radiusM), zone: office.zone, active: office.active });

/**
 * Admin HR → Titik kantor (20 Nov 2026): where "di dalam area kantor" is for absensi. A point
 * is pasted from Google Maps ("lat, lng" or the map's link) or taken from this device's location,
 * with a radius of 30 to 1,000 m. A phone less sure than 100 m counts as outside anyway.
 */
/**
 * A small OpenStreetMap of the point (no key, no tracking cookie), about two radii around it, so the
 * admin sees the pin is on the office before saving.
 */
function MapPreview({ point, radiusM, title }: { point: GeoPoint; radiusM: number; title: string }) {
  const span = Math.max(0.002, (radiusM * 3) / 111_000);
  const bbox = [point.lng - span, point.lat - span, point.lng + span, point.lat + span].map(value => value.toFixed(6)).join(",");
  return <iframe className={css.map} title={title} referrerPolicy="no-referrer"
    src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${point.lat},${point.lng}`} />;
}

export function OfficePoints({ initial }: { initial: Office[] }) {
  const [offices, setOffices] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(initial.length ? null : empty);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const point = draft ? parseLatLng(draft.point) : null;

  const here = () => {
    if (!navigator.geolocation) { setMessage({ tone: "error", text: "Browser ini tidak bisa membaca lokasi." }); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      position => {
        setBusy(false);
        setDraft(value => value && { ...value, point: `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}` });
        setMessage({ tone: "success", text: `Lokasi perangkat ini dipakai (akurasi ±${Math.round(position.coords.accuracy)} m). Periksa di Maps sebelum menyimpan.` });
      },
      () => { setBusy(false); setMessage({ tone: "error", text: "Lokasi tidak bisa dibaca. Izinkan Lokasi untuk situs ini, atau tempel koordinat dari Google Maps." }); },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  async function save() {
    if (!draft || !point) return;
    setBusy(true); setMessage(null);
    try {
      const body = JSON.stringify({ name: draft.name, lat: point.lat, lng: point.lng, radiusM: Number(draft.radiusM), zone: draft.zone, active: draft.active });
      const result = draft.id
        ? await adminRequest<Office[]>(hrAdminApi.office(draft.id), { method: "PUT", body })
        : await adminRequest<Office[]>(hrAdminApi.offices, { method: "POST", body });
      setOffices(result.data ?? []); setDraft(null); setMessage({ tone: "success", text: result.message });
    } catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(false); }
  }

  async function remove(office: Office) {
    if (!window.confirm(`Hapus titik ${office.name}? Absen lama tetap menyimpan namanya.`)) return;
    setBusy(true); setMessage(null);
    try {
      const result = await adminRequest<Office[]>(hrAdminApi.office(office.id), { method: "DELETE" });
      setOffices(result.data ?? []); setDraft(null); setMessage({ tone: "success", text: result.message });
    } catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(false); }
  }

  return <>
    <PageHeader title="Titik kantor" subtitle="Absen di dalam radius titik ini tercatat sah; di luar radius wajib alasan dan menunggu dicek."
      actions={<>
        <ConsoleButton variant="primary" icon={<Plus size={16} aria-hidden />} disabled={busy} onClick={() => { setMessage(null); setDraft(empty); }}>Tambah titik</ConsoleButton>
      </>} />
    {message && <Notice tone={message.tone}>{message.text}</Notice>}

    {draft && <Card title={draft.id ? `Ubah ${draft.name}` : "Titik kantor baru"}>
      <div className={css.form}>
        <label className={css.field}>Nama kantor<input type="text" maxLength={60} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="Mis. Kantor Pusat" /></label>
        <label className={`${css.field} ${css.grow}`}>Koordinat (lat, lng) atau link Google Maps
          <input type="text" value={draft.point} onChange={event => setDraft({ ...draft, point: event.target.value })} placeholder="-7.78, 110.36" aria-invalid={draft.point !== "" && !point} />
        </label>
        <label className={css.field}>Radius (meter)<input type="number" min={30} max={1000} step={10} value={draft.radiusM} onChange={event => setDraft({ ...draft, radiusM: event.target.value })} /></label>
        <label className={css.field}>Zona waktu
          <select value={draft.zone} onChange={event => setDraft({ ...draft, zone: event.target.value as ViewerZone })}>{VIEWER_ZONES.map(zone => <option key={zone} value={zone}>{zone}</option>)}</select>
        </label>
        <label className={css.check}><input type="checkbox" checked={draft.active} onChange={event => setDraft({ ...draft, active: event.target.checked })} /> Aktif</label>
      </div>
      {point && <MapPreview point={point} radiusM={Number(draft.radiusM) || 100} title={`Peta titik ${draft.name || "baru"}`} />}
      <p className={css.muted}>{point ? `Titik: ${point.lat}, ${point.lng}. Pastikan penanda di peta tepat di kantor.` : draft.point ? "Koordinat belum terbaca. Tempel dari Google Maps: klik kanan titiknya, lalu klik angka koordinat untuk menyalin." : "Tempel koordinat, atau pakai lokasi perangkat ini saat berada di kantor."}</p>
      <div className={css.actions}>
        <ConsoleButton icon={<Crosshair size={16} aria-hidden />} disabled={busy} onClick={here}>Pakai lokasi saya</ConsoleButton>
        {point && <ConsoleButtonLink href={mapsLink(point)} target="_blank" rel="noopener" icon={<ExternalLink size={16} aria-hidden />}>Lihat di Maps</ConsoleButtonLink>}
        <ConsoleButton variant="primary" disabled={busy || !point || draft.name.trim().length < 2} onClick={() => void save()}>Simpan</ConsoleButton>
        <ConsoleButton disabled={busy} onClick={() => setDraft(null)}>Batal</ConsoleButton>
      </div>
    </Card>}

    <Card title={`Titik kantor (${offices.length})`}>
      {offices.length === 0 ? <p className={css.muted}>Belum ada titik kantor. Sampai ada, semua absen harian terhitung di luar area.</p> : <ul className={css.rows}>
        {offices.map(office => <li key={office.id} className={css.row}>
          <div className={css.rowHead}>
            <strong>{office.name}</strong>
            <Pill tone={office.active ? "ok" : "neutral"}>{office.active ? "Aktif" : "Nonaktif"}</Pill>
          </div>
          <p className={css.muted}>{office.lat}, {office.lng} · radius {office.radiusM} m · {office.zone}</p>
          {draft?.id !== office.id && <MapPreview point={office} radiusM={office.radiusM} title={`Peta ${office.name}`} />}
          <div className={css.actions}>
            <ConsoleButtonLink href={mapsLink(office)} target="_blank" rel="noopener" icon={<ExternalLink size={16} aria-hidden />}>Lihat di Maps</ConsoleButtonLink>
            <ConsoleButton disabled={busy} onClick={() => { setMessage(null); setDraft(draftOf(office)); }}>Ubah</ConsoleButton>
            <ConsoleButton disabled={busy} onClick={() => void remove(office)}>Hapus</ConsoleButton>
          </div>
        </li>)}
      </ul>}
    </Card>
  </>;
}
