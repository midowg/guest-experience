/*
 * The front page's look (26 Nov 2026), picked by the super admin in Super admin → Halaman utama:
 * "kartu" (the apps as a fan of 3D cards over a colour mesh) or "lampu" (a dark screen where the
 * cursor is a lamp over the joglo, the apps in a dock). Stored in admin_settings.home_style
 * (migration 202611260001); before it, and whenever it cannot be read, the front page is "kartu".
 */
export const HOME_STYLE_MIGRATION = "202611260001_home_style.sql";
export const HOME_STYLES = ["kartu", "lampu"] as const;
export type HomeStyle = (typeof HOME_STYLES)[number];
export const DEFAULT_HOME_STYLE: HomeStyle = "kartu";
export const isHomeStyle = (value: unknown): value is HomeStyle => (HOME_STYLES as readonly unknown[]).includes(value);
export const homeStyleLabels: Record<HomeStyle, { name: string; hint: string }> = {
  kartu: { name: "Kartu 3D", hint: "Aplikasi sebagai kipas kartu 3D di atas gradasi warna yang bergerak. Di HP, kartu digeser ke samping." },
  lampu: { name: "Lampu", hint: "Layar gelap, kursor jadi lampu yang menerangi foto joglo, judul muncul huruf demi huruf, aplikasi di dock. Di HP, lampu bergerak sendiri." },
};
