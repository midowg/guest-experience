import { Spinner } from "@/components/main-wam/ui";

/** Absen mode tablet while it loads: the frame draws no bars here, so a quiet full-screen wait. */
export default function Loading() {
  return <div role="status" aria-busy="true" style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--mw-bg)" }}>
    <Spinner label="Memuat absen mode tablet" />
  </div>;
}
