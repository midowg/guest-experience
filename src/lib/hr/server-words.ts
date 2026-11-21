/*
 * What the server says to an employee (its answers and refusals are written in Indonesian, shared with
 * WAM and Admin HR), put into English for WG People when English is on (21 Nov 2026). An answer not
 * listed here is shown as it came, so a new server message never disappears; add it here when it is
 * one an employee can meet.
 */

const kindWord = (kind: string) => (kind.toLowerCase() === "masuk" ? "clock-in" : kind.toLowerCase() === "pulang" ? "clock-out" : kind);

const exact: Record<string, string> = {
  // The connection and the shared answers (components/pra-wam/api.ts, lib/server/http.ts).
  "Tidak dapat terhubung. Periksa jaringan lalu coba lagi.": "Can't connect. Check your network, then try again.",
  "Server belum dapat memberikan jawaban. Coba lagi sebentar.": "The server isn't answering yet. Try again in a moment.",
  "Permintaan gagal. Coba lagi.": "The request failed. Try again.",
  "Terjadi kesalahan. Muat ulang lalu coba lagi.": "Something went wrong. Reload and try again.",
  "Layanan belum dapat memproses permintaan. Coba kembali nanti.": "The service can't handle this right now. Try again later.",
  "Permintaan harus berasal dari situs acara ini.": "This request must come from this site.",
  "Isi formulir terlalu besar.": "The form is too large.",
  "Periksa kembali isian formulir.": "Check the form again.",
  "Terlalu banyak permintaan. Tunggu sepuluh menit sebelum mencoba kembali.": "Too many requests. Wait ten minutes before trying again.",
  "Data tersimpan.": "Saved.",
  // Signing in and passwords (lib/server/pra-wam/session.ts, api/wam/*).
  "Sesi berakhir. Masuk kembali sebelum melanjutkan.": "Your session ended. Sign in again to continue.",
  "Email/nama panggilan atau password tidak cocok. Periksa lalu coba lagi.": "The email or password doesn't match. Check them and try again.",
  "Isi email atau nama panggilan.": "Enter your email.",
  "Isi password.": "Enter your password.",
  "Berhasil masuk.": "Signed in.",
  "Password baru harus berbeda dari password awal.": "The new password must differ from the first password.",
  "Password saat ini tidak cocok.": "The current password doesn't match.",
  "Password belum dapat diganti. Coba lagi sebentar.": "The password can't be changed yet. Try again in a moment.",
  "Password baru tersimpan. Perangkat lain perlu masuk ulang.": "New password saved. Other devices need to sign in again.",
  "Password baru minimal 8 karakter dan ada angka atau simbol.": "The new password needs at least 8 characters and a number or symbol.",
  "Terlalu sering meminta tautan. Tunggu beberapa menit lalu coba lagi.": "Too many requests. Wait a few minutes, then try again.",
  // Clocking in and the face (lib/server/hr/attendance.ts, api/hr/*).
  "Login karyawan belum disiapkan.": "Employee sign-in isn't set up yet.",
  "Penyimpanan foto belum disiapkan.": "Photo storage isn't set up yet.",
  "Sesi absen tidak dikenali. Ulangi dari awal.": "This clock-in session isn't recognised. Start again.",
  "Sesi daftar wajah tidak dikenali. Ulangi dari awal.": "This face registration isn't recognised. Start again.",
  "Waktu absen habis. Ulangi dari awal.": "Time ran out. Start again.",
  "Foto belum sampai di penyimpanan. Ulangi.": "The photo didn't reach storage. Try again.",
  "Isi berkas bukan gambar WebP atau JPEG. Ulangi.": "The file isn't a WebP or JPEG picture. Try again.",
  "Gerakan wajah belum terbaca. Ulangi dan ikuti petunjuknya.": "The face movement wasn't read. Try again and follow the prompts.",
  "Wajah di kamera berganti di tengah jalan. Ulangi dengan wajahmu sendiri.": "The face in the camera changed midway. Try again with your own face.",
  "Foto wajah belum jelas. Lihat lurus ke kamera, lalu coba lagi.": "The face photo isn't clear. Look straight at the camera, then try again.",
  "Data wajah tidak lengkap. Ulangi dari awal.": "The face data is incomplete. Start again.",
  "Daftarkan wajahmu dulu, sekali saja.": "Register your face first, just once.",
  "Setujui pemakaian data wajah dulu.": "Agree to the use of your face data first.",
  "Kamu di luar area kantor. Pilih alasannya dulu.": "You're outside the office area. Pick a reason first.",
  "Wajahmu sudah terdaftar. Untuk daftar ulang, minta Admin HR.": "Your face is already registered. Ask HR to register again.",
  "Wajahmu sudah didaftarkan dan menunggu persetujuan Admin HR.": "Your face is registered and waiting for HR's approval.",
  "Wajahmu sudah terdaftar.": "Your face is already registered.",
  "Wajahmu terdaftar.": "Your face is registered.",
  "Wajahmu terdaftar. Admin HR akan memeriksanya; sementara itu absenmu tetap tercatat.": "Your face is registered. HR will review it; meanwhile your clock-ins are still recorded.",
  "Data wajahmu sudah dihapus. Absenmu akan dicatat Admin HR.": "Your face data is deleted. HR will record your attendance.",
  "Foto acuanmu belum diproses Admin HR. Daftarkan wajahmu sekarang.": "HR hasn't processed your reference photo yet. Register your face now.",
  "Foto acuanmu belum bisa dipakai. Daftarkan wajahmu sekali lagi.": "Your reference photo can't be used. Register your face once more.",
  "Akunmu belum punya foto acuan dari HR (tidak ada di data GreatDay), jadi wajahmu didaftarkan sekali di sini. Admin HR akan menyetujuinya.":
    "Your account has no reference photo from HR (not in the GreatDay data), so you register your face once here. HR will approve it.",
  "Siap mengunggah.": "Ready to upload.",
  // Corrections (revisi).
  "Revisi terkirim. Admin HR akan memeriksanya.": "Correction sent. HR will review it.",
  "Revisi dibatalkan.": "Correction withdrawn.",
  "Revisi ini sudah diputuskan atau dibatalkan.": "This correction has already been decided or withdrawn.",
  "Revisi tidak ditemukan.": "Correction not found.",
  "Revisi hanya untuk 31 hari terakhir, sampai hari ini.": "Corrections are only for the last 31 days, up to today.",
  "Revisi hanya untuk 31 hari terakhir.": "Corrections are only for the last 31 days.",
  "Absen itu tidak ditemukan.": "That record wasn't found.",
  "Masih ada revisi yang menunggu untuk absen ini. Batalkan dulu bila ingin mengubahnya.": "There's already a pending correction for this record. Withdraw it first if you want to change it.",
  "Jam tidak valid.": "The time isn't valid.",
  "Tanggal tidak valid.": "The date isn't valid.",
  "Pilih jenis revisi.": "Pick what to correct.",
  "Tulis alasan revisinya.": "Write why it needs a correction.",
  "Alasan paling banyak 300 karakter.": "The reason can be at most 300 characters.",
  "Isi jam yang benar.": "Enter the correct time.",
  "Pilih absen yang mau direvisi.": "Pick the record to correct.",
  "Pilih alasan yang benar.": "Pick the correct reason.",
  // Leave (cuti, sakit, izin, dinas).
  "Pengajuan terkirim. Admin HR akan memeriksanya.": "Request sent. HR will review it.",
  "Pengajuan dibatalkan.": "Request withdrawn.",
  "Pengajuan ini sudah diputuskan atau dibatalkan.": "This request has already been decided or withdrawn.",
  "Tanggal itu sudah ada di pengajuanmu yang lain. Batalkan yang masih menunggu di Pengajuan, atau minta Admin HR membatalkan yang sudah disetujui.":
    "Those dates are already in another of your requests. Withdraw the pending one in Requests, or ask HR to cancel the approved one.",
  "Bulan tidak dikenali.": "Month not recognised.",
  "Pilih jenisnya.": "Pick the type.",
  "Tanggal tidak dikenali.": "Date not recognised.",
  "Tulis keterangan singkat (minimal 3 huruf).": "Write a short note (at least 3 letters).",
  "Keterangan paling banyak 300 karakter.": "The note can be at most 300 characters.",
  "Tanggal selesai tidak boleh sebelum tanggal mulai.": "The end date can't be before the start date.",
  "Pengajuan paling jauh setahun ke depan.": "Requests can be at most a year ahead.",
};

const patterns: [RegExp, (...groups: string[]) => string][] = [
  [/^Absen (masuk|pulang) hari ini sudah tercatat\.$/, kind => `Today's ${kindWord(kind)} is already recorded.`],
  [/^Absen (masuk|pulang) tercatat\.$/, kind => `${kindWord(kind)[0].toUpperCase()}${kindWord(kind).slice(1)} recorded.`],
  [/^Absen (masuk|pulang) tanggal itu sudah ada\. Pilih "Jam salah" untuk mengubah jamnya\.$/, kind => `A ${kindWord(kind)} already exists that day. Pick "Wrong time" to change its time.`],
  [/^Wajah belum cocok dengan foto acuan \(kecocokan (\d+)%, perlu sekitar (\d+)%\)\. Cari tempat terang, lihat lurus ke kamera, lalu coba lagi\.$/,
    (score, needed) => `Your face doesn't match the reference photo yet (${score}% match, about ${needed}% needed). Find a bright spot, look straight at the camera, then try again.`],
  [/^Paling lama (\d+) hari dalam satu pengajuan\.$/, days => `At most ${days} days in one request.`],
  [/^Pengajuan paling jauh (\d+) hari ke belakang\.$/, days => `Requests can start at most ${days} days back.`],
  [/^Absen harian menunggu migrasi (.+)\.$/, file => `Daily attendance is waiting for migration ${file}.`],
  [/^Cuti dan izin menunggu migrasi (.+)\.$/, file => `Leave is waiting for migration ${file}.`],
];

/** An Indonesian server answer in English; unknown ones unchanged. */
export function englishOf(text: string): string {
  const known = exact[text];
  if (known) return known;
  for (const [pattern, say] of patterns) {
    const found = pattern.exec(text);
    if (found) return say(...found.slice(1));
  }
  return text;
}
