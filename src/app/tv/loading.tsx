import { AppLoading } from "@/components/ui/AppLoading";

/** The office TV while its board loads (19 Nov 2026): its dark board's colours, never a white screen. */
export default function TvLoading() {
  return <AppLoading tone="tv" name="Werkudara" label="Memuat papan TV" />;
}
