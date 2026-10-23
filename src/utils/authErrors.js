// Pesan error yang ramah untuk Firebase Auth. Untuk login, semua kegagalan kredensial memakai
// SATU pesan yang sama supaya orang luar tidak bisa menebak email mana yang terdaftar.

export const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim())

export function loginErrorMessage(code) {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Email atau password salah.'
    case 'auth/user-disabled':
      return 'Akun ini dinonaktifkan. Hubungi owner.'
    case 'auth/too-many-requests':
      return 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.'
    case 'auth/network-request-failed':
      return 'Koneksi bermasalah. Periksa internetmu.'
    case 'auth/operation-not-allowed':
      return 'Login Email/Password belum diaktifkan di Firebase (Authentication → Sign-in method).'
    default:
      return 'Gagal masuk. Coba lagi.'
  }
}

// Lupa password: email tidak terdaftar sengaja TIDAK dibedakan dari yang terdaftar.
// Mengembalikan null kalau error-nya harus disembunyikan (tampilkan pesan netral saja).
export function resetErrorMessage(code) {
  switch (code) {
    case 'auth/user-not-found':
      return null
    case 'auth/invalid-email':
      return 'Format email tidak valid.'
    case 'auth/too-many-requests':
      return 'Terlalu banyak permintaan. Tunggu beberapa menit lalu coba lagi.'
    case 'auth/network-request-failed':
      return 'Koneksi bermasalah. Periksa internetmu.'
    default:
      return 'Gagal mengirim tautan. Coba lagi.'
  }
}

export function createAccountErrorMessage(code) {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Email ini sudah punya akun di Firebase (mungkin pernah dipakai login di Customer App). Pakai email lain untuk karyawan ini.'
    case 'auth/invalid-email':
      return 'Format email tidak valid.'
    case 'auth/operation-not-allowed':
      return 'Login Email/Password belum diaktifkan di Firebase (Authentication → Sign-in method).'
    case 'auth/weak-password':
      return 'Password sementara ditolak oleh kebijakan password project. Longgarkan kebijakan di Firebase Console.'
    case 'permission-denied':
      return 'Kamu tidak punya izin menambah admin. Pastikan akunmu berperan Owner.'
    case 'auth/network-request-failed':
      return 'Koneksi bermasalah. Periksa internetmu.'
    default:
      return 'Gagal membuat akun. Coba lagi.'
  }
}
