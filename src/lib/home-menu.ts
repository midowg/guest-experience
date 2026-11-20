import { z } from "zod";

/*
 * The front page's app menu (26 Nov 2026), set by the super admin in Super admin → Halaman utama:
 * which apps show, in what order, and their name, line, description and colour. The apps themselves
 * are fixed (their address and logo come from the code, src/app/EmptyHome.tsx), so the menu can never
 * point at a guest page. Stored in admin_settings.home_menu (migration 202611260002); before it the
 * front page shows the default below. Pure, so it is tested without a server.
 */
export const HOME_MENU_MIGRATION = "202611260002_home_menu.sql";
export const HOME_APPS = ["wam", "wlm", "booking", "signage", "admin"] as const;
export type HomeApp = (typeof HOME_APPS)[number];

export type HomeMenuItem = {
  app: HomeApp; shown: boolean; name: string; what: string; description: string; tone: string;
  /** Which account opens it, as the card says. */
  account: string;
};

export const defaultHomeMenu: HomeMenuItem[] = [
  { app: "wam", shown: true, name: "WAM 2026", what: "Aplikasi karyawan", account: "Akun WAM", tone: "#2f6feb",
    description: "Semua kebutuhan Werkudara Annual Meeting dalam satu aplikasi: agenda, appraisal, absen, dan MoM." },
  { app: "wlm", shown: true, name: "WLM", what: "Werkudara Life Mode", account: "Akun WAM", tone: "#e0457b",
    description: "Catat olahraga dan kebiasaan sehat, kumpulkan poin, dan naik peringkat bersama tim." },
  { app: "booking", shown: true, name: "Booking Kantor", what: "Ruang meeting", account: "Akun WAM", tone: "#0d9488",
    description: "Pesan ruang meeting kantor dan lihat jadwalnya, tanpa bentrok." },
  { app: "signage", shown: true, name: "Signage", what: "TV kantor", account: "Akun tim", tone: "#ea580c",
    description: "Atur tayangan di TV kantor: pengumuman, jadwal ruang, dan foto meeting." },
  { app: "admin", shown: true, name: "Journey Admin", what: "Untuk tim Werkudara", account: "Akun tim", tone: "#7c3aed",
    description: "Siapkan undangan, kunjungan tamu, dan handbook acara dengan sentuhan Werkudara." },
];
/** What each app is, for the admin's list (fixed, not editable). */
export const homeAppLabels: Record<HomeApp, string> = {
  wam: "Aplikasi WAM (/wam)", wlm: "Aplikasi WLM (/wlm)", booking: "Booking Kantor (/booking)", signage: "Atur TV kantor (Admin WAM → TV)", admin: "Admin Journey (/admin)",
};

const text = (label: string, max: number) => z.string().trim().min(1, `Isi ${label}.`).max(max, `${label[0].toUpperCase()}${label.slice(1)} paling banyak ${max} huruf.`);
export const homeMenuItemSchema = z.object({
  app: z.enum(HOME_APPS),
  shown: z.boolean(),
  name: text("nama", 30),
  what: text("keterangan", 40),
  description: text("deskripsi", 160),
  account: text("akun", 24),
  tone: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pilih warna."),
});
export const homeMenuSchema = z.array(homeMenuItemSchema).length(HOME_APPS.length, "Kirim semua aplikasi.")
  .refine(items => new Set(items.map(item => item.app)).size === HOME_APPS.length, "Setiap aplikasi sekali saja.")
  .refine(items => items.some(item => item.shown), "Tampilkan sedikitnya satu aplikasi.");

/**
 * A stored menu read back safely: its known apps in its order with valid fields, anything missing or
 * broken taken from the default, apps it lacks added at the end. Never throws.
 */
export function readHomeMenu(stored: unknown): HomeMenuItem[] {
  if (!Array.isArray(stored)) return defaultHomeMenu.map(item => ({ ...item }));
  const seen = new Set<HomeApp>();
  const items: HomeMenuItem[] = [];
  for (const raw of stored) {
    const app = (raw as { app?: unknown } | null)?.app;
    if (!(HOME_APPS as readonly unknown[]).includes(app) || seen.has(app as HomeApp)) continue;
    const fallback = defaultHomeMenu.find(item => item.app === app)!;
    const merged = { ...fallback, ...(raw as object) };
    const parsed = homeMenuItemSchema.safeParse(merged);
    items.push(parsed.success ? parsed.data : { ...fallback });
    seen.add(app as HomeApp);
  }
  for (const item of defaultHomeMenu) if (!seen.has(item.app)) items.push({ ...item });
  return items.some(item => item.shown) ? items : items.map(item => ({ ...item, shown: true }));
}
