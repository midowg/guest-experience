import { ImageResponse } from "next/og";
import { daysUntil, wibDateLabel } from "@/lib/leadership-reset/form";
import { publicForm } from "@/lib/server/leadership-reset";

export const dynamic = "force-dynamic";
export const alt = "Refleksi Leader sebelum training Leadership Reset";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Link preview for /refleksi (WhatsApp, Telegram): the training's own card, from the CMS text. */
export default async function Image() {
  const { content } = await publicForm();
  const days = content.trainingDate ? daysUntil(content.trainingDate) : -1;
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#0F172A", color: "#F8FAFC", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 30, fontWeight: 600, color: "#93C5FD" }}>Refleksi sebelum training</div>
        <div style={{ marginTop: 16, fontSize: 92, fontWeight: 800, lineHeight: 1.05 }}>{content.title}</div>
        {content.tagline && <div style={{ display: "flex", marginTop: 18, fontSize: 40, color: "#E2E8F0" }}>{`“${content.tagline}”`}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 32, color: "#E2E8F0" }}>
          <div style={{ display: "flex", gap: 10 }}><span>bersama</span><span style={{ fontWeight: 700, color: "#FFFFFF" }}>{content.coach}</span></div>
          {content.trainingDate && <div style={{ display: "flex", marginTop: 8 }}>{wibDateLabel(content.trainingDate)}</div>}
        </div>
        <div style={{ display: "flex", padding: "18px 32px", borderRadius: 20, background: "#1D4ED8", color: "#FFFFFF", fontSize: 32, fontWeight: 700 }}>
          {days > 1 ? `${days} hari lagi · Isi refleksi` : "Isi refleksi Anda"}
        </div>
      </div>
    </div>,
    size,
  );
}
