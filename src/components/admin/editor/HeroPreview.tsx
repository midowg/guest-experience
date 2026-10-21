"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Monitor, Move, RotateCcw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui";
import { defaultFraming, getFraming } from "@/lib/hero-framing";
import { frameChangeSchema, heroPreviewSchema } from "@/lib/hero-preview";
import type { EventRecord, HeroImage, PhotoFrame } from "@/lib/types";
import styles from "@/components/admin/editor/hero-preview.module.css";

export function HeroPreview({ event, onChange }: { event: EventRecord; onChange: (hero: Partial<HeroImage>) => void }) {
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [editing, setEditing] = useState(false);
  const [width, setWidth] = useState(300);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const viewport = device === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const scale = Math.min(1, width / viewport.width);
  const framing = getFraming(event.hero);
  const current = framing[device];
  const parsed = heroPreviewSchema.safeParse(event);
  const send = useCallback(() => {
    const payload = heroPreviewSchema.safeParse(event);
    if (payload.success) frameRef.current?.contentWindow?.postMessage({ type: "hero:update", event: payload.data, editing }, location.origin);
  }, [event, editing]);
  useEffect(() => {
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { send(); }, [send, device]);
  useEffect(() => {
    const receive = (message: MessageEvent) => {
      if (message.origin !== location.origin || message.source !== frameRef.current?.contentWindow) return;
      if (message.data?.type === "hero:ready") { send(); return; }
      const change = frameChangeSchema.safeParse(message.data);
      if (editing && change.success && change.data.device === device) onChange({ framing: { ...getFraming(event.hero), [device]: change.data.frame } });
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [send, device, editing, event.hero, onChange]);
  function update(patch: Partial<PhotoFrame>) { onChange({ framing: { ...framing, [device]: { ...current, ...patch } } }); }
  return <div className={styles.preview}>
    <div className={styles.toolbar} aria-label="Ukuran pratinjau">
      <Button type="button" variant={device === "mobile" ? "primary" : "secondary"} aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}><Smartphone size={18} aria-hidden="true" /> HP</Button>
      <Button type="button" variant={device === "desktop" ? "primary" : "secondary"} aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}><Monitor size={18} aria-hidden="true" /> Desktop</Button>
      <Button type="button" variant="secondary" disabled={!event.hero.url} aria-pressed={editing} onClick={() => setEditing(value => !value)}><Move size={18} aria-hidden="true" /> {editing ? "Selesai mengatur foto" : "Atur foto"}</Button>
    </div>
    <p className="field-hint">Tampilan asli pada {viewport.width} × {viewport.height} px, diperkecil agar muat. Pratinjau mengikuti perubahan yang belum disimpan. Posisi foto HP dan desktop disimpan terpisah.</p>
    {!parsed.success && <p role="status" className="field-error">Lengkapi URL foto dan isian pembuka yang valid untuk memperbarui pratinjau. Tampilan terakhir tetap dipertahankan.</p>}
    <div ref={container} className={styles.container}>
      <div className={styles.stage} style={{ width: viewport.width * scale, height: viewport.height * scale }}>
        <iframe ref={frameRef} src="/admin/hero-preview" title={`Pratinjau pembuka ${device === "mobile" ? "HP" : "desktop"}`} onLoad={send} className={styles.frame} style={{ width: viewport.width, height: viewport.height, transform: `scale(${scale})` }} />
      </div>
    </div>
    {editing && event.hero.url && <div className={styles.controls}>
      <p>Geser foto langsung di pratinjau, atau gunakan kontrol berikut. Zoom memperbesar ruang geser jika foto pas dengan bingkai.</p>
      {([['x', 'Posisi horizontal', 0, 100, 1], ['y', 'Posisi vertikal', 0, 100, 1], ['zoom', 'Zoom foto', 1, 3, 0.05]] as const).map(([key, label, min, max, step]) => <label key={key} className={styles.slider}>{label}<input type="range" min={min} max={max} step={step} value={current[key]} onChange={e => update({ [key]: Number(e.target.value) })} /><output>{key === "zoom" ? `${current[key].toFixed(2)}×` : `${Math.round(current[key])}%`}</output></label>)}
      <Button type="button" variant="secondary" onClick={() => onChange({ framing: { ...framing, [device]: defaultFraming()[device] } })}><RotateCcw size={17} aria-hidden="true" /> Reset foto {device === "mobile" ? "HP" : "desktop"}</Button>
    </div>}
  </div>;
}
