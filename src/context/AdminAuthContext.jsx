import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../api/firebase.js'
import { ROLES } from '../utils/adminRoles.js'

// Login admin memakai Email + Password (Firebase Authentication). Akun hanya dibuat oleh owner.
// Hak akses ditentukan dokumen `admins/{uid}` di Firestore (role: 'owner' | 'kasir'), yang juga dipakai
// Security Rules, jadi tidak bisa dipalsukan dari browser.
//
// status:
//   'loading'      = sedang memeriksa sesi / peran
//   'signedOut'    = belum login
//   'unregistered' = punya akun login tetapi belum terdaftar sebagai admin
//   'ready'        = admin terdaftar (lihat `role`)

const AdminAuthContext = createContext(null)

export function AdminAuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [role, setRole] = useState(null)
  const [roleReady, setRoleReady] = useState(false)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
      setAuthReady(true)
      if (u) {
        setRoleReady(false)
      } else {
        setRole(null)
        setRoleReady(true)
      }
    })
  }, [])

  // Peran dibaca real-time: kalau owner mengubah peranmu, tampilan ikut berubah tanpa login ulang.
  useEffect(() => {
    if (!user) return undefined
    return onSnapshot(
      doc(db, 'admins', user.uid),
      (snap) => {
        const r = snap.exists() ? snap.data().role : null
        setRole(ROLES.includes(r) ? r : null)
        setRoleReady(true)
      },
      (err) => {
        console.warn('Gagal membaca peran admin:', err)
        setRole(null)
        setRoleReady(true)
        setAuthError('Gagal memeriksa hak akses. Muat ulang halaman.')
      }
    )
  }, [user])

  // Dua fungsi ini melempar error Firebase (dengan `code`); pesan ramahnya diurus halaman Login.
  const loginWithEmail = useCallback((email, password) => signInWithEmailAndPassword(auth, email, password), [])
  const resetPassword = useCallback((email) => sendPasswordResetEmail(auth, email), [])
  const logout = useCallback(() => signOut(auth), [])

  const status = !authReady ? 'loading' : !user ? 'signedOut' : !roleReady ? 'loading' : role ? 'ready' : 'unregistered'

  const value = useMemo(
    () => ({
      user,
      role,
      status,
      authError,
      isAuthed: status === 'ready',
      isOwner: role === 'owner',
      loginWithEmail,
      resetPassword,
      logout,
    }),
    [user, role, status, authError, loginWithEmail, resetPassword, logout]
  )

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth harus dipakai di dalam AdminAuthProvider')
  return ctx
}
