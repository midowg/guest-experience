"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Brain, Dumbbell, HandHeart, PiggyBank, RefreshCw, Sparkles, Users } from "lucide-react";
import { ConsoleButton, Pill, type ConsoleTone } from "@/components/console";
import { MIGRATION_WELLBEING, dimensionLabels, type DimensionId } from "@/lib/wellbeing/rules";
import css from "./wellbeing-admin.module.css";

/** Each dimension's colour (a console tone) and icon, the same everywhere in the admin. */
export const dimensionLook: Record<DimensionId, { tone: ConsoleTone; Icon: typeof Brain }> = {
  physical: { tone: "teal", Icon: Dumbbell },
  emotional: { tone: "purple", Icon: Brain },
  social: { tone: "warn", Icon: Users },
  financial: { tone: "blue", Icon: PiggyBank },
  spiritual: { tone: "brass", Icon: Sparkles },
};

export function DimensionPill({ dimension }: { dimension: DimensionId }) {
  const { tone, Icon } = dimensionLook[dimension];
  // Icon and name with an even gap, both centred on the pill's line (18 Nov 2026).
  return <Pill tone={tone} className={css.dimPill}><Icon size={14} strokeWidth={2.25} aria-hidden="true" /><span>{dimensionLabels[dimension]}</span></Pill>;
}

export function DimensionIcon({ dimension, size = 40 }: { dimension: DimensionId; size?: number }) {
  const { tone, Icon } = dimensionLook[dimension];
  return <span className={css.dimIcon} data-tone={tone} style={{ width: size, height: size }} aria-hidden="true"><Icon size={Math.round(size * .5)} /></span>;
}

/** Points per dimension as one bar of five colours. */
export function DimensionBar({ dims, label }: { dims: Record<DimensionId, number>; label?: string }) {
  const total = Object.values(dims).reduce((sum, value) => sum + Math.max(0, value), 0);
  if (!total) return <span className={css.dimBarEmpty} aria-hidden="true" />;
  return <span className={css.dimBar} role="img" aria-label={label ?? (Object.entries(dims) as [DimensionId, number][]).filter(([, value]) => value > 0).map(([key, value]) => `${dimensionLabels[key]} ${value}`).join(", ")}>
    {(Object.entries(dims) as [DimensionId, number][]).filter(([, value]) => value > 0).map(([key, value]) =>
      <span key={key} data-tone={dimensionLook[key].tone} style={{ flexGrow: value }} />)}
  </span>;
}

/** Before the owner applies the migration: nothing is stored yet. */
export function WaitingMigration() {
  return <div className={css.notice} data-tone="warn" role="status">
    <AlertTriangle size={20} aria-hidden="true" />
    <div><strong>Database Wellbeing belum dipasang.</strong> Admin sudah bisa dilihat, tapi data belum bisa disimpan sampai migrasi <code>{MIGRATION_WELLBEING}</code> dijalankan pemilik di Supabase SQL Editor.</div>
  </div>;
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className={css.empty} role="alert">
    <span className={css.emptyIcon} data-tone="bad"><AlertTriangle size={24} aria-hidden="true" /></span>
    <strong>Belum bisa dimuat</strong>
    <p>{message}</p>
    <ConsoleButton icon={<RefreshCw size={18} aria-hidden="true" />} onClick={onRetry}>Coba lagi</ConsoleButton>
  </div>;
}

export function Empty({ icon = <HandHeart size={24} aria-hidden="true" />, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return <div className={css.empty}>
    <span className={css.emptyIcon} data-tone="blue">{icon}</span>
    <strong>{title}</strong>
    {children && <p>{children}</p>}
  </div>;
}

/** A small "memperbarui…" mark while kept data refreshes in the background. */
export function Refreshing({ on }: { on: boolean }) {
  return <span className={css.refreshing} data-on={on} aria-live="polite">{on ? "Memperbarui…" : ""}</span>;
}
