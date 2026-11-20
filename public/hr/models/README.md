# Model absen wajah

Dipakai oleh absensi HR Werkudara (`src/components/hr/faceEngine.ts`), dijalankan di browser
dengan `onnxruntime-web` 1.31.1.

| Berkas | Isi | Sumber | Lisensi |
| --- | --- | --- | --- |
| `sface-2021dec-int8.onnx` (9.896.933 byte) | SFace (MobileFaceNet dengan loss SFace), int8. Masuk: `data` [1, 3, 112, 112] RGB 0–255, wajah disejajarkan 5 titik. Keluar: `fc1` [1, 128]. | `face_recognition_sface_2021dec_int8.onnx` dari [opencv/opencv_zoo](https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface), diunduh 20 Nov 2026 | Apache-2.0, lihat `LICENSE-sface.txt` |

- README OpenCV Zoo menyebut akurasi alat evaluasinya 0,9940 (fp32) dan 0,9932 (versi kuantisasi);
  dataset latih tidak disebut di sana.
- Nama berkas memuat versi. Model baru = nama baru, dan `FACE_MODEL_VERSION` di
  `src/lib/hr/face-match.ts` ikut diganti, karena embedding model berbeda tidak bisa dibandingkan.
- Service worker HR (`public/hr/sw.js`) menyimpan berkas di folder ini setelah unduhan pertama.
