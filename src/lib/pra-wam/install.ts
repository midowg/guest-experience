/*
 * Pasang WAM (9 Nov 2026): how to put WAM on a phone or laptop as an app, and turn its
 * notifications on, per device and browser. The steps follow the makers' own help pages, checked
 * 9 Nov 2026: Apple "Turn a website into an app in Safari on iPhone" (iOS 26/27), Google Chrome
 * Help "Use web apps" (Android: More → Install and create shortcut → Install; computer: the
 * Install icon, or More → Cast, save, and share → Install page as app), Samsung Internet (Menu →
 * Add page to → Home screen). Menu names differ a little by version and language, so each step
 * names the Indonesian word and the English one.
 */

export type InstallDevice = "iphone" | "android" | "laptop";
export type InstallBrowser = "safari" | "chrome-ios" | "chrome-android" | "samsung" | "chrome-desktop" | "edge" | "safari-mac";
export type InstallArtKind =
  | "ios-more" | "ios-share-menu" | "ios-share-chrome" | "ios-add" | "ios-webapp"
  | "android-menu" | "android-install" | "android-confirm" | "samsung-menu" | "samsung-add"
  | "desktop-install" | "desktop-dialog" | "home-icon" | "wam-notif" | "allow-prompt"
  | "ios-settings-notif" | "android-settings-notif" | "desktop-site-notif";
export type InstallStep = { art: InstallArtKind; title: string; text: string };

export const installDevices: { id: InstallDevice; label: string; browsers: InstallBrowser[] }[] = [
  { id: "iphone", label: "iPhone & iPad", browsers: ["safari", "chrome-ios"] },
  { id: "android", label: "Android", browsers: ["chrome-android", "samsung"] },
  { id: "laptop", label: "Laptop", browsers: ["chrome-desktop", "edge", "safari-mac"] },
];

export const installBrowserLabels: Record<InstallBrowser, string> = {
  "safari": "Safari", "chrome-ios": "Chrome", "chrome-android": "Chrome", "samsung": "Samsung Internet", "chrome-desktop": "Chrome", "edge": "Edge", "safari-mac": "Safari (Mac)",
};

/** The steps to install WAM, per browser. */
export const installSteps: Record<InstallBrowser, InstallStep[]> = {
  "safari": [
    { art: "ios-more", title: "Buka WAM di Safari, ketuk •••", text: "Tombol ••• ada di bilah bawah, di samping alamat. Kalau bilah alamatmu di atas, ketuk tombol Bagikan (kotak dengan panah ke atas)." },
    { art: "ios-share-menu", title: "Ketuk Bagikan (Share)", text: "Daftar pilihan berbagi akan terbuka." },
    { art: "ios-add", title: "Ketuk Tambah ke Layar Utama", text: "Gulir ke bawah sampai ada Tambah ke Layar Utama (Add to Home Screen). Belum ada? Ketuk Edit Tindakan di paling bawah, lalu tambahkan." },
    { art: "ios-webapp", title: "Nyalakan Buka sebagai App Web, lalu Tambah", text: "Pastikan sakelar Buka sebagai App Web (Open as Web App) menyala, lalu ketuk Tambah (Add). Ikon WAM muncul di layar utama." },
  ],
  "chrome-ios": [
    { art: "ios-share-chrome", title: "Buka WAM di Chrome, ketuk Bagikan", text: "Ikon Bagikan ada di kanan bilah alamat. Paling pasti lewat Safari; pakai cara ini kalau kamu biasa memakai Chrome." },
    { art: "ios-add", title: "Ketuk Tambah ke Layar Utama", text: "Gulir daftarnya sampai ada Tambah ke Layar Utama (Add to Home Screen)." },
    { art: "ios-webapp", title: "Ketuk Tambah", text: "Kalau ada sakelar Buka sebagai App Web, nyalakan. Lalu ketuk Tambah (Add)." },
  ],
  "chrome-android": [
    { art: "android-menu", title: "Buka WAM di Chrome, ketuk ⋮", text: "Tombol ⋮ ada di kanan atas, di samping alamat." },
    { art: "android-install", title: "Ketuk Instal aplikasi", text: "Namanya Instal aplikasi atau Instal dan buat pintasan (Install). Di Chrome versi lama: Tambahkan ke layar utama." },
    { art: "android-confirm", title: "Ketuk Instal", text: "WAM muncul di layar utama dan di daftar aplikasi, seperti aplikasi lain." },
  ],
  "samsung": [
    { art: "samsung-menu", title: "Buka WAM di Samsung Internet, ketuk ≡", text: "Tombol menu ≡ ada di kanan bawah. Kalau di bilah alamat ada ikon instal, ketuk itu saja." },
    { art: "samsung-add", title: "Tambahkan halaman ke → Layar utama", text: "Pilih Tambahkan halaman ke (Add page to), lalu Layar utama (Home screen), lalu Tambahkan." },
  ],
  "chrome-desktop": [
    { art: "desktop-install", title: "Klik ikon Instal di bilah alamat", text: "Ikonnya di ujung kanan alamat. Tidak ada? Buka menu ⋮ → Transmisikan, simpan, dan bagikan → Instal halaman sebagai aplikasi." },
    { art: "desktop-dialog", title: "Klik Instal", text: "WAM terbuka di jendelanya sendiri dan bisa dibuka dari menu Start atau Dock." },
  ],
  "edge": [
    { art: "desktop-install", title: "Klik ikon Aplikasi tersedia", text: "Ikonnya di bilah alamat. Tidak ada? Buka menu ··· → Aplikasi → Instal situs ini sebagai aplikasi." },
    { art: "desktop-dialog", title: "Klik Instal", text: "WAM terbuka di jendelanya sendiri." },
  ],
  "safari-mac": [
    { art: "desktop-dialog", title: "Berkas → Tambahkan ke Dock", text: "Di Safari (macOS Sonoma atau lebih baru), klik menu Berkas (File) → Tambahkan ke Dock (Add to Dock), lalu Tambahkan. WAM muncul di Dock." },
  ],
};

/** After installing: the notification steps, the last one for when they were blocked. */
export function notificationSteps(device: InstallDevice): InstallStep[] {
  const open: InstallStep = device === "iphone"
    ? { art: "home-icon", title: "Buka WAM dari ikonnya", text: "Di iPhone, notifikasi hanya bisa dinyalakan dari ikon WAM di layar utama, bukan dari Safari. Perlu iOS 16.4 atau lebih baru." }
    : device === "android"
      ? { art: "home-icon", title: "Buka WAM dari ikonnya", text: "Buka WAM dari ikon di layar utama atau daftar aplikasi." }
      : { art: "desktop-dialog", title: "Buka WAM yang sudah terpasang", text: "Buka WAM dari jendelanya sendiri, atau tetap di browser." };
  const blocked: InstallStep = device === "iphone"
    ? { art: "ios-settings-notif", title: "Terblokir? Izinkan di Pengaturan iPhone", text: "Buka Pengaturan → Notifikasi → WAM, lalu nyalakan Izinkan Notifikasi (Allow Notifications)." }
    : device === "android"
      ? { art: "android-settings-notif", title: "Terblokir? Izinkan di Info aplikasi", text: "Tekan lama ikon WAM → Info aplikasi → Notifikasi, lalu nyalakan. Atau Setelan → Aplikasi → WAM → Notifikasi." }
      : { art: "desktop-site-notif", title: "Terblokir? Izinkan di browser", text: "Klik ikon di kiri alamat → Notifikasi → Izinkan, lalu muat ulang WAM." };
  return [
    open,
    { art: "wam-notif", title: "Pengaturan → Notifikasi → nyalakan", text: "Di WAM, buka Pengaturan → Notifikasi, lalu nyalakan Notifikasi di HP." },
    { art: "allow-prompt", title: "Ketuk Izinkan", text: "Saat ditanya, pilih Izinkan (Allow). Setelah itu coba Kirim notifikasi tes." },
    blocked,
  ];
}

/** The device and browser this is, to open the right guide first; a guess, the person can switch. */
export function detectInstall(userAgent: string, touchPoints = 0): { device: InstallDevice; browser: InstallBrowser } {
  // An iPad says it is a Mac; it gives itself away by its touch screen.
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)) return { device: "iphone", browser: /CriOS/.test(userAgent) ? "chrome-ios" : "safari" };
  if (/Android/.test(userAgent)) return { device: "android", browser: /SamsungBrowser/.test(userAgent) ? "samsung" : "chrome-android" };
  const safariMac = /Macintosh/.test(userAgent) && /Safari\//.test(userAgent) && !/Chrome|Chromium|Edg\//.test(userAgent);
  return { device: "laptop", browser: /Edg\//.test(userAgent) ? "edge" : safariMac ? "safari-mac" : "chrome-desktop" };
}
