# Justmine Tea — Admin & Kasir

App terpisah buat staff kelola pesanan & menu, connect ke Firestore yang
sama persis dengan app customer (`justmine-tea-customer`).

## Setup & Instalasi

1. Install dependencies:
   ```bash
   npm install
   ```

2. Jalankan development server:
   ```bash
   npm run dev
   ```
   Defaultnya jalan di **http://localhost:5174** (beda port dari app
   customer yang di 5173), jadi kedua app ini bisa dibuka **bersamaan**
   di 2 tab browser buat demo end-to-end.

3. Login pakai PIN default: **123456**
   (ganti di `src/context/AdminAuthContext.jsx`, konstanta `ADMIN_PIN`)

## Fitur

- **Dashboard Pesanan** (`/orders`) — lihat semua pesanan masuk secara
  real-time (dari customer, baik yang login maupun tamu), ubah status
  (Menunggu → Diproses → Siap → Selesai), atau batalkan pesanan.
- **Kelola Menu** (`/menu`) — tambah/edit/hapus item menu, toggle stok
  habis, dan tombol "Import Menu Default" buat ngisi 7 menu awal kalau
  database masih kosong.

## Catatan Penting

- PIN login di sini **cuma proteksi sederhana buat demo**, bukan sistem
  keamanan yang aman dipakai production (siapa pun yang baca source code
  bisa lihat PIN-nya). Untuk pemakaian beneran, ganti dengan Firebase
  Auth + role admin yang diverifikasi di Firestore Security Rules.
- Pastikan Firestore Security Rules di Firebase Console kamu masih
  mengizinkan read/write (biasanya default "test mode" selama 30 hari).
  Kalau sudah lewat, app ini (dan app customer) akan gagal baca/tulis
  data — perlu disesuaikan rules-nya.
