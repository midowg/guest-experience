/** Before migration 202611250001, or for a key that opens nothing. */
export function LrNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 16, background: "#F6F7F9", color: "#111827", fontFamily: "Inter, system-ui, sans-serif" }}>
    <div style={{ maxWidth: 440, padding: 24, borderRadius: 16, background: "#fff", border: "1px solid #E4E7EC" }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>{title}</h1>
      <p style={{ margin: "8px 0 0", color: "#4B5563", lineHeight: 1.6 }}>{children}</p>
    </div>
  </main>;
}
