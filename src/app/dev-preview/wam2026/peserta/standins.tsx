import { Camera, Images, QrCode } from "lucide-react";
import { mainWamPath } from "@/lib/routes";
import { Button, Card, List, ListRow, StackPreview } from "@/components/main-wam/ui";

/*
 * Stand-ins for other areas' slots in agen A's previews only (the real slots read the database):
 * agen D's Absen button, agen B's Momen card and "Foto sesi ini" row, drawn as the prototype shows
 * them so Beranda's four blocks and Detail sesi can be checked. Never used in the app.
 */

export const AbsenStandIn = ({ home }: { home?: boolean }) => <Button block={!home} icon={<QrCode />} href={mainWamPath.scan}>{home ? "Absen sekarang" : "Absen"}</Button>;

export const MomenStandIn = ({ count = 12 }: { count?: number }) => <Card as="article">
  <StackPreview photos={[]} sub={`${count} foto baru`} href={mainWamPath.moments()} />
  <Button variant="secondary" block icon={<Camera />} href={mainWamPath.camera()}>Ambil foto</Button>
</Card>;

export const SessionPhotosStandIn = ({ sessionId, count }: { sessionId: string; count: number }) =>
  <ListRow icon={<Images />} title="Foto sesi ini" value={String(count)} href={mainWamPath.moments({ sesi: sessionId })} aria-label={`Foto sesi ini, ${count} foto`} />;

export const PhotosListStandIn = ({ sessionId, count }: { sessionId: string; count: number }) =>
  <List><SessionPhotosStandIn sessionId={sessionId} count={count} /></List>;
