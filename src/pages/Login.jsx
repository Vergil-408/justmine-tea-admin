import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAdminAuth } from '../context/AdminAuthContext.jsx'
import { isValidEmail, loginErrorMessage, resetErrorMessage } from '../utils/authErrors.js'

const inputCls =
  'w-full px-4 py-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-sage'

export default function Login() {
  const { status, user, authError, loginWithEmail, resetPassword, logout } = useAdminAuth()
  const [mode, setMode] = useState('login') // 'login' | 'reset'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  if (status === 'ready') return <Navigate to="/orders" replace />

  function switchMode(next) {
    setMode(next)
    setError('')
    setNotice('')
  }

  async function handleLogin(e) {
    e.preventDefault()
    if (!isValidEmail(email) || !password) {
      setError('Isi email dan password.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await loginWithEmail(email.trim(), password)
    } catch (err) {
      setError(loginErrorMessage(err.code))
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  async function handleReset(e) {
    e.preventDefault()
    if (!isValidEmail(email)) {
      setError('Isi email yang valid.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await resetPassword(email.trim())
      setNotice('Kalau email itu terdaftar, tautan untuk mengatur ulang password sudah dikirim. Cek Inbox (dan folder Spam).')
    } catch (err) {
      const msg = resetErrorMessage(err.code)
      if (msg) setError(msg)
      else setNotice('Kalau email itu terdaftar, tautan untuk mengatur ulang password sudah dikirim. Cek Inbox (dan folder Spam).')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-surface border border-border rounded-2xl p-8 shadow-sm">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-sage flex items-center justify-center text-white text-2xl font-bold mb-3">
            차
          </div>
          <h1 className="text-lg font-bold">Justmine Tea</h1>
          <p className="text-sm text-ink-muted">Masuk sebagai Admin / Kasir</p>
        </div>

        {status === 'loading' && <p className="text-center text-sm text-ink-muted">Memeriksa akses…</p>}

        {status === 'unregistered' && (
          <div className="text-sm text-center">
            <p>
              Akun <strong>{user?.email}</strong> belum terdaftar sebagai admin.
            </p>
            <p className="text-ink-muted mt-2">Hubungi owner untuk didaftarkan.</p>
            <button type="button" onClick={logout} className="w-full mt-5 border border-border font-semibold py-3 rounded-xl hover:bg-sage-light transition-colors">
              Keluar
            </button>
          </div>
        )}

        {status === 'signedOut' && mode === 'login' && (
          <form onSubmit={handleLogin} noValidate>
            <label className="block text-xs font-semibold text-ink-muted mb-1.5" htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" autoFocus value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} className={`${inputCls} mb-3`} placeholder="nama@email.com" />

            <label className="block text-xs font-semibold text-ink-muted mb-1.5" htmlFor="password">Password</label>
            <div className="relative">
              <input id="password" type={showPw ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError('') }} className={`${inputCls} pr-12`} placeholder="••••••••" />
              <button type="button" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? 'Sembunyikan password' : 'Tampilkan password'} className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-ink-muted hover:bg-sage-light">
                <span className="material-symbols-outlined text-[20px]">{showPw ? 'visibility_off' : 'visibility'}</span>
              </button>
            </div>

            {error && <p role="alert" className="text-danger text-xs font-semibold mt-3 text-center">{error}</p>}

            <button type="submit" disabled={busy} className="w-full mt-5 bg-sage text-white font-semibold py-3 rounded-xl hover:bg-sage-dark transition-colors disabled:opacity-50">
              {busy ? 'Masuk…' : 'Masuk'}
            </button>
            <button type="button" onClick={() => switchMode('reset')} className="w-full mt-3 text-xs font-semibold text-ink-muted hover:text-sage-dark">
              Lupa password?
            </button>
          </form>
        )}

        {status === 'signedOut' && mode === 'reset' && (
          <form onSubmit={handleReset} noValidate>
            <p className="text-sm mb-3">Masukkan email akunmu. Kami kirim tautan untuk membuat password baru.</p>
            <label className="block text-xs font-semibold text-ink-muted mb-1.5" htmlFor="reset-email">Email</label>
            <input id="reset-email" type="email" autoComplete="username" autoFocus value={email} onChange={(e) => { setEmail(e.target.value); setError(''); setNotice('') }} className={inputCls} placeholder="nama@email.com" />

            {error && <p role="alert" className="text-danger text-xs font-semibold mt-3 text-center">{error}</p>}
            {notice && <p role="status" className="text-sage-dark text-xs font-semibold mt-3 text-center">{notice}</p>}

            <button type="submit" disabled={busy} className="w-full mt-5 bg-sage text-white font-semibold py-3 rounded-xl hover:bg-sage-dark transition-colors disabled:opacity-50">
              {busy ? 'Mengirim…' : 'Kirim tautan'}
            </button>
            <button type="button" onClick={() => switchMode('login')} className="w-full mt-3 text-xs font-semibold text-ink-muted hover:text-sage-dark">
              Kembali ke halaman masuk
            </button>
          </form>
        )}

        {authError && <p className="text-danger text-xs font-semibold mt-3 text-center">{authError}</p>}
      </div>
    </div>
  )
}
