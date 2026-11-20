import type { ReactNode } from "react";
import admin from "@/components/admin/admin.module.css";
import { WamAcaraNav } from "@/components/admin/wam-acara/WamAcaraNav";
import type { WamAcaraSectionKey } from "@/components/admin/wam-acara/sections";

/**
 * Admin WAM 2027's real console frame (menu, white panel) around one of its pages, for the dev-preview
 * pages (no sign-in; the pages are 404 in production).
 */
export function AdminPreviewFrame({ current, children }: { current: WamAcaraSectionKey; children: ReactNode }) {
  return <WamAcaraNav current={current} className={admin.shell} personName="Admin Contoh" opensPraWam>{children}</WamAcaraNav>;
}

/** ?migrasi=belum, ?isi=kosong from a dev-preview page's search params. */
export const previewFlags = (params: Record<string, string | undefined>) => ({ waiting: params.migrasi === "belum", empty: params.isi === "kosong" });
