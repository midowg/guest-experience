import { notFound } from "next/navigation";
import { Camera, CircleCheck, Images, MapPin, QrCode, Share, Users } from "lucide-react";
import { mainWamScreen, type MainWamScreen } from "@/lib/main-wam/screen";
import { mainWamPath } from "@/lib/routes";
import { MainWamTheme } from "@/components/main-wam/theme";
import { MainWamShell, ScreenContent, ScreenSection, ShellActions, ShellChrome, Stack } from "@/components/main-wam/shell";
import {
  ActionBar, Banner, BigNumber, BracketCard, Button, Card, CardHead, EyebrowLabel, PulseDot, ProgressBar, SegmentDots, Pill, Divider, Chip, EmptyState, IconButton, List, ListRow, SectionHeader, SessionList, SessionRow, StackPreview, StatusPill, Text,
} from "@/components/main-wam/ui";

export const dynamic = "force-dynamic";

/** Which frame to draw: the address it stands for (the shell reads screens from the address). */
const SCREENS: Record<string, string> = {
  beranda: mainWamPath.home,
  agenda: mainWamPath.agenda(),
  momen: mainWamPath.moments(),
  saya: mainWamPath.me,
  detail: mainWamPath.session("contoh"),
  tugas: mainWamPath.silentMeeting(),
  kamera: mainWamPath.camera(),
};

/**
 * Development-only check of the Main WAM frame (no sign-in, 404 in production):
 * ?layar=beranda|agenda|momen|saya|detail|tugas|kamera; &mode=dark|system. Built from server components with icons
 * as elements, as a real screen would be.
 */
export default async function MainWamShellPreview({ searchParams }: { searchParams: Promise<{ layar?: string; mode?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { layar = "beranda", mode } = await searchParams;
  const address = SCREENS[layar] ?? SCREENS.beranda;
  const screen: MainWamScreen | null = mainWamScreen(address.split("?")[0]);
  return <MainWamTheme mode={mode === "dark" ? "dark" : mode === "system" ? "system" : "light"}>
    <MainWamShell screen={screen} unread={3} badges={{ momen: 12 }} greeting={{ kicker: "Selamat pagi", name: "Rani", dayDots: { total: 4, current: 2, label: "Hari ke-2 dari 4" } }}>
      {layar === "momen" ? <Momen /> : layar === "kamera" ? <Kamera /> : layar === "tugas" ? <Tugas /> : <Isi layar={layar} />}
    </MainWamShell>
  </MainWamTheme>;
}

function Isi({ layar }: { layar: string }) {
  return <ScreenContent>
    {layar === "detail" && <ShellActions><IconButton icon={<Share />} label="Bagikan" /></ShellActions>}
    {layar === "beranda" && <Banner tone="info" title="Pengumuman penting" href="#">Bus berangkat 06.30 dari lobi.</Banner>}
    <ScreenSection label="Sekarang">
      <BracketCard motif="konstelasi">
        <CardHead title={<EyebrowLabel tone="gold"><PulseDot /> Sedang berlangsung</EyebrowLabel>} end={<Pill>Sesi</Pill>} />
        <Text variant="display" as="h2">Pemaparan departemen</Text>
        <Text color="2">Aula Utama · lantai 1 · 08.00–12.00</Text>
        <ProgressBar label="Berjalan" value={38} thin />
        <Divider />
        <Button block icon={<QrCode />}>Absen sekarang</Button>
      </BracketCard>
    </ScreenSection>
    <Card motif="matriks">
      <div><Pill>Misi</Pill></div>
      <BigNumber value="340" unit="Poin" tone="gold" />
      <SegmentDots total={5} current={3} label="Misi 3 dari 5" fill />
    </Card>
    <ScreenSection>
      <SectionHeader title="Hari ini" action={{ label: "Agenda", href: "#" }} />
      <Card flush>
        <SessionList>
          <SessionRow start="07.00" end="08.00" title="Sarapan" place="Restoran" status="done" checkedIn href="#" />
          <SessionRow start="08.00" end="12.00" title="Pemaparan departemen" place="Aula Utama" status="live" href="#" />
          <SessionRow start="13.30" end="15.00" title="Team building" place="Lapangan" href="#" extra={<StatusPill status="changed" />} />
          <SessionRow start="19.00" end="22.00" title="Malam keakraban" place="Ballroom" href="#" />
        </SessionList>
      </Card>
    </ScreenSection>
    <Card>
      <StackPreview href="#" photos={[]} sub="12 foto baru" />
      <Button variant="secondary" block icon={<Camera />}>Ambil foto</Button>
    </Card>
    <List>
      <ListRow icon={<Users />} title="Kelompok & kamar" sub="Kamar 208 · bersama Sari" href="#" />
      <ListRow icon={<MapPin />} title="Panduan" sub="Denah, hotel, dress code" href="#" />
    </List>
  </ScreenContent>;
}

function Momen() {
  return <ScreenContent>
    <ShellActions><Chip href="#" icon={<Images />}>Galeri</Chip></ShellActions>
    <EmptyState icon={<Images />} title="Belum ada foto baru">Foto dari sesi yang berlangsung muncul di sini.</EmptyState>
    <Button icon={<Camera />}>Ambil foto</Button>
  </ScreenContent>;
}

function Kamera() {
  return <ScreenContent>
    <ShellChrome hideTopBar />
    <Text variant="subtitle" color="media" as="h1">Kamera (bilahnya sendiri)</Text>
    <Text color="media-2">Layar tugas gelap: tanpa bilah atas shell dan tanpa bilah bawah.</Text>
  </ScreenContent>;
}

function Tugas() {
  return <>
    <ScreenContent>
      <Stack>
        <Banner tone="success" icon={<CircleCheck />}>Silent Meeting dibuka sampai 15.00.</Banner>
        <Text color="2">Layar tugas: ✕ di kiri, tanpa bilah bawah, aksi di ActionBar.</Text>
      </Stack>
    </ScreenContent>
    <ActionBar note="Tanpa nama."><Button block>Kirim</Button></ActionBar>
  </>;
}
