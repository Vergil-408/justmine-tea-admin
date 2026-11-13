import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth'
import { auth, db, firebaseConfig } from './firebase.js'
import { generateTempPassword } from '../utils/password.js'

/** Daftar admin (dokumen `admins/{uid}`: role, email, name, status, photoUrl). Id dokumen = UID akun Firebase Auth. */
export function listenToAdmins(callback) {
  return onSnapshot(
    collection(db, 'admins'),
    (snap) => callback(snap.docs.map((d) => ({ ...d.data(), uid: d.id }))),
    (err) => console.error('Gagal memuat daftar admin:', err)
  )
}

/**
 * Owner membuat akun karyawan:
 *  1) akun dibuat di aplikasi Firebase KEDUA (supaya owner tidak ikut logout),
 *     dengan password yang diinput atau acak jika dikosongkan
 *  2) dokumen admins/{uid} ditulis (hanya owner yang lolos rules)
 *  3) email "atur password" dikirim jika password tidak diset manual
 * Mengembalikan { uid, emailSent }.
 */
export async function createStaffAccount({ email, name, role, password, status, photoUrl }) {
  const secondary = initializeApp(firebaseConfig, `staff-${Date.now()}`)
  const secAuth = getAuth(secondary)
  secAuth.languageCode = 'id'
  try {
    const pwd = password && password.trim().length >= 6 ? password.trim() : generateTempPassword()
    const cred = await createUserWithEmailAndPassword(secAuth, email, pwd)
    const uid = cred.user.uid

    try {
      await setDoc(doc(db, 'admins', uid), {
        role: role || 'kasir',
        email,
        name: name || null,
        status: status ?? 'aktif',
        photoUrl: photoUrl || null,
        createdAt: serverTimestamp(),
      })
    } catch (err) {
      await cred.user.delete().catch(() => {}) // batalkan akun yatim supaya email bisa dicoba lagi
      throw err
    }

    let emailSent = true
    // Kirim email atur/reset password jika password acak atau diminta
    if (!password || password.trim().length < 6) {
      try {
        await sendPasswordResetEmail(secAuth, email)
      } catch (err) {
        console.warn('Email atur password gagal terkirim:', err)
        emailSent = false
      }
    }
    await signOut(secAuth).catch(() => {})
    return { uid, emailSent }
  } finally {
    await deleteApp(secondary).catch(() => {})
  }
}

/** Kirim ulang tautan atur/reset password ke email karyawan. */
export const resendSetupEmail = (email) => sendPasswordResetEmail(auth, email)

export const setAdminRole = (uid, role) => updateDoc(doc(db, 'admins', uid), { role })

export const updateAdmin = (uid, patch) => updateDoc(doc(db, 'admins', uid), patch)

/** Mencabut akses = menghapus dokumen admins. Akun loginnya tetap ada di Authentication tetapi tidak bisa apa-apa. */
export const removeAdmin = (uid) => deleteDoc(doc(db, 'admins', uid))
