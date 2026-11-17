import type { ReactNode } from "react";
import admin from "@/components/admin/admin.module.css";
import { WamNav } from "@/components/admin/wam/WamNav";
import type { WamSectionKey } from "@/components/admin/wam/sections";

/**
 * Admin WAM's real console frame (menu, white panel) around a Main WAM isi acara page, for the
 * dev-preview pages of agen E (no sign-in; the pages are 404 in production).
 */
export function AdminPreviewFrame({ current, children }: { current: WamSectionKey; children: ReactNode }) {
  return <WamNav current={current} className={admin.shell} personName="Admin Contoh">{children}</WamNav>;
}

/** ?migrasi=belum, ?isi=kosong from a dev-preview page's search params. */
export const previewFlags = (params: Record<string, string | undefined>) => ({ waiting: params.migrasi === "belum", empty: params.isi === "kosong" });
