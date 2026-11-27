import { CalendarDays, Coffee, DoorOpen, HeartPulse, LayoutDashboard, MonitorPlay, ScanFace } from 'lucide-react';

/** One app on the front page, behind its own sign-in. Both looks (Kartu 3D, Lampu) draw the same list. */
export type Door = {
  href: string; icon: keyof typeof doorIcons; tone: string; name: string; what: string; key: string; description: string;
  /** The app's own logo (its launcher icon), shown in place of the drawn icon when it has one. */
  logo?: string;
};
export const doorIcons = { wam: CalendarDays, wlm: HeartPulse, booking: DoorOpen, hr: ScanFace, coffee: Coffee, signage: MonitorPlay, admin: LayoutDashboard };
