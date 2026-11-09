/*
 * Install WAM (9 Nov 2026): how to put WAM on a phone or laptop as an app, and turn its
 * notifications on, per device and browser. Every step follows the maker's own help page, read in
 * its Indonesian version on 9 Nov 2026 (menu names as written there; English in brackets):
 * - iPhone, Safari: Apple "Mengubah situs web menjadi app di Safari di iPhone" (iOS 26/27),
 *   support.apple.com/id-id/guide/iphone/iphea86e5236/ios
 * - iPhone, Chrome: Google "Membuat pintasan untuk situs di Chrome" (iPhone & iPad),
 *   support.google.com/chrome/answer/15085120; the sheet is iOS's own, so Apple's names.
 * - Android, Chrome; laptop, Chrome: Google "Menggunakan aplikasi web",
 *   support.google.com/chrome/answer/9658361 (Android and Komputer).
 * - Samsung Internet: Samsung Developer "Web Development Guide" (the star in the address bar
 *   turns into a plus for an installable site). Samsung gives no Indonesian menu names; the menu
 *   route (Add page to → Home screen) is from the Samsung Community, so it is only the fallback.
 * - Laptop, Edge: Microsoft "Menginstal, mengelola, atau menghapus instalan aplikasi di Microsoft
 *   Edge", support.microsoft.com/id-id/edge/install-manage-or-uninstall-apps-in-microsoft-edge
 * - Laptop, Safari Mac: Apple "Menjadikan situs web menjadi app di Safari di Mac" (macOS 14+),
 *   support.apple.com/id-id/guide/safari/ibrw9e991864/mac
 * - Notifications: Apple "Mengubah pengaturan pemberitahuan di iPhone" (iph7c3d96bab); Google
 *   "Mengontrol notifikasi di Android" (android/answer/9079661); Google "Mengubah izin setelan
 *   situs" (chrome/answer/114662); WebKit "Web Push for Web Apps on iOS and iPadOS" (iOS 16.4).
 * Check them again after a big iOS or Chrome release.
 */

export type InstallDevice = "iphone" | "android" | "laptop";
export type InstallBrowser = "safari" | "chrome-ios" | "chrome-android" | "samsung" | "chrome-desktop" | "edge" | "safari-mac";
export type InstallArtKind =
  | "ios-more" | "ios-share-menu" | "ios-share-chrome" | "ios-add" | "ios-webapp"
  | "android-menu" | "android-install" | "android-confirm" | "samsung-menu" | "samsung-plus" | "samsung-add"
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
    { art: "ios-more", title: "Buka WAM di Safari, ketuk •••", text: "Tombol ••• ada di samping alamat. Kalau tata letak Tab-mu Bawah atau Atas, langsung ketuk tombol Bagikan (kotak dengan panah ke atas)." },
    { art: "ios-share-menu", title: "Ketuk Bagikan", text: "Daftar pilihan berbagi akan terbuka (Share)." },
    { art: "ios-add", title: "Ketuk Tambah ke Layar Utama", text: "Gulir daftarnya ke bawah (Add to Home Screen). Tidak ada? Di paling bawah ketuk Edit Tindakan, lalu tambahkan Tambah ke Layar Utama." },
    { art: "ios-webapp", title: "Nyalakan Buka sebagai App Web, ketuk Tambah", text: "Sakelar Buka sebagai App Web (Open as Web App) harus menyala, lalu ketuk Tambah (Add). Ikon WAM muncul di Layar Utama." },
  ],
  "chrome-ios": [
    { art: "ios-share-chrome", title: "Buka WAM di Chrome, ketuk Bagikan", text: "Tombol Bagikan ada di sebelah kanan kolom alamat." },
    { art: "ios-add", title: "Ketuk Tambah ke Layar Utama", text: "Gulir daftarnya sampai ada Tambah ke Layar Utama (Add to Home Screen)." },
    { art: "ios-webapp", title: "Periksa namanya, ketuk Tambah", text: "Biarkan namanya WAM, lalu ketuk Tambah (Add). Ikon WAM muncul di Layar Utama." },
  ],
  "chrome-android": [
    { art: "android-menu", title: "Buka WAM di Chrome, ketuk ⋮", text: "Tombol Lainnya (⋮) ada di sebelah kanan kolom alamat." },
    { art: "android-install", title: "Ketuk Instal dan buat pintasan", text: "Pilih Instal dan buat pintasan (Install and create shortcut). Tidak ada? Perbarui Chrome dulu di Play Store." },
    { art: "android-confirm", title: "Ketuk Instal", text: "Ikuti petunjuk di layar. WAM muncul di layar utama dan di daftar aplikasi." },
  ],
  "samsung": [
    { art: "samsung-plus", title: "Buka WAM di Samsung Internet, ketuk ikon +", text: "Untuk situs yang bisa di-install, ikon bintang di bilah alamat berganti menjadi ikon tambah (+)." },
    { art: "samsung-add", title: "Pilih layar utama (Home screen)", text: "Lalu konfirmasi. Tidak ada ikon +? Buka menu ≡ di kanan bawah, pilih Add page to, lalu Home screen. Nama menunya bisa berbeda di HP-mu." },
  ],
  "chrome-desktop": [
    { art: "desktop-install", title: "Klik ikon Instal di kolom alamat", text: "Ikonnya di kanan kolom alamat. Tidak ada? Klik Lainnya (⋮) → Transmisikan, simpan, dan bagikan → Instal halaman sebagai aplikasi." },
    { art: "desktop-dialog", title: "Klik Instal", text: "Ikuti petunjuk di layar. WAM terbuka di jendelanya sendiri." },
  ],
  "edge": [
    { art: "desktop-install", title: "Klik Instal saat Edge menawarkan", text: "Kalau tidak ada tawaran: klik Pengaturan dan lainnya (…) → Alat lainnya → Aplikasi → Instal situs ini sebagai aplikasi." },
    { art: "desktop-dialog", title: "Klik Instal", text: "WAM terbuka di jendelanya sendiri. Semua aplikasi yang sudah di-install ada di edge://apps." },
  ],
  "safari-mac": [
    { art: "desktop-dialog", title: "Bagikan → Tambahkan ke Dock → Tambah", text: "Di Safari (macOS Sonoma 14 atau lebih baru), klik tombol Bagikan di bar alat, pilih Tambahkan ke Dock (Add to Dock), lalu klik Tambah. Ikon WAM muncul di Dock." },
  ],
};

/** After installing: the notification steps, the last one for when they were blocked. */
export function notificationSteps(device: InstallDevice): InstallStep[] {
  const open: InstallStep = device === "iphone"
    ? { art: "home-icon", title: "Buka WAM dari ikonnya", text: "Di iPhone, notifikasi hanya bisa dinyalakan dari ikon WAM di layar utama, bukan dari Safari. Perlu iOS 16.4 atau lebih baru." }
    : device === "android"
      ? { art: "home-icon", title: "Buka WAM dari ikonnya", text: "Buka WAM dari ikon di layar utama atau daftar aplikasi." }
      : { art: "desktop-dialog", title: "Buka WAM yang sudah di-install", text: "Buka WAM dari jendelanya sendiri, atau tetap di browser." };
  const blocked: InstallStep = device === "iphone"
    ? { art: "ios-settings-notif", title: "Terblokir? Buka Pengaturan iPhone", text: "Buka Pengaturan → Pemberitahuan, ketuk WAM, lalu nyalakan Izinkan Pemberitahuan (Allow Notifications)." }
    : device === "android"
      ? { art: "android-settings-notif", title: "Terblokir? Buka Setelan Android", text: "Buka Setelan → Notifikasi → Notifikasi aplikasi, ketuk WAM, lalu aktifkan notifikasinya. Langkahnya bisa sedikit berbeda menurut merek HP." }
      : { art: "desktop-site-notif", title: "Terblokir? Izinkan di browser", text: "Di kiri alamat, klik Lihat informasi situs → Setelan situs, ubah Notifikasi ke Izinkan, lalu muat ulang WAM." };
  return [
    open,
    { art: "wam-notif", title: "Pengaturan → Notifikasi → nyalakan", text: "Di WAM, buka Pengaturan → Notifikasi, lalu nyalakan sakelar Notifikasi di HP." },
    { art: "allow-prompt", title: "Ketuk Izinkan", text: "Saat HP bertanya, pilih Izinkan (Allow). Setelah itu ketuk Kirim notifikasi tes untuk mencoba." },
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
