import { useEffect, useState } from 'react'
import TopNav from '../components/TopNav.jsx'
import { useAdminAuth } from '../context/AdminAuthContext.jsx'
import { listenToAdmins, createStaffAccount, resendSetupEmail, setAdminRole, removeAdmin } from '../api/admins.js'
import { ROLES, ROLE_LABEL, canChangeRole, canRemove } from '../utils/adminRoles.js'
import { createAccountErrorMessage, isValidEmail } from '../utils/authErrors.js'

const btn = 'text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-border hover:bg-sage-light disabled:opacity-40'
const inputCls = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-sage'

export default function AdminsAdmin() {
  const { user } = useAdminAuth()
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ email: '', name: '', role: 'kasir' })
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState('')
  const [formNotice, setFormNotice] = useState('')

  useEffect(() => {
    return listenToAdmins((d) => {
      setAdmins(d.sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || '')))
      setLoading(false)
    })
  }, [])

  async function run(fn, failMsg) {
    try {
      await fn()
    } catch (err) {
      alert(`${failMsg}: ${err.message}`)
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    setFormError('')
    setFormNotice('')
    const email = form.email.trim().toLowerCase()
    if (!isValidEmail(email)) return setFormError('Isi email yang valid.')
    if (admins.some((a) => (a.email || '').toLowerCase() === email)) return setFormError('Email ini sudah terdaftar sebagai admin.')

    setCreating(true)
    try {
      const { emailSent } = await createStaffAccount({ email, name: form.name.trim(), role: form.role })
      setForm({ email: '', name: '', role: 'kasir' })
      setFormNotice(
        emailSent
          ? `Akun dibuat. Tautan untuk mengatur password sudah dikirim ke ${email}. Minta karyawan mengecek Inbox dan folder Spam.`
          : `Akun dibuat, tetapi email gagal terkirim. Tekan "Kirim ulang tautan" pada ${email} di daftar bawah.`
      )
    } catch (err) {
      setFormError(createAccountErrorMessage(err.code))
    } finally {
      setCreating(false)
    }
  }

  function changeRole(a, role) {
    const check = canChangeRole(admins, a.uid, role, user.uid)
    if (!check.ok) return alert(check.reason)
    run(() => setAdminRole(a.uid, role), 'Gagal mengubah peran')
  }

  function remove(a) {
    const check = canRemove(admins, a.uid, user.uid)
    if (!check.ok) return alert(check.reason)
    if (!confirm(`Cabut akses ${a.name || a.email}? Akun loginnya tetap ada, tetapi tidak bisa membuka halaman admin.`)) return
    run(() => removeAdmin(a.uid), 'Gagal mencabut akses')
  }

  async function resend(a) {
    try {
      await resendSetupEmail(a.email)
      alert(`Tautan atur password dikirim ke ${a.email}.`)
    } catch (err) {
      alert('Gagal mengirim tautan: ' + err.message)
    }
  }

  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="max-w-3xl mx-auto px-5 py-6">
        <h1 className="text-xl font-bold mb-5">Kelola Admin</h1>

        <form onSubmit={handleCreate} className="bg-surface border border-border rounded-2xl p-5 mb-8" noValidate>
          <h2 className="font-bold text-sm mb-1">Tambah karyawan</h2>
          <p className="text-xs text-ink-muted mb-4">
            Karyawan menerima email berisi tautan untuk membuat passwordnya sendiri. Kamu tidak perlu tahu passwordnya.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1" htmlFor="staff-email">Email</label>
              <input id="staff-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} placeholder="kasir@email.com" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1" htmlFor="staff-name">Nama</label>
              <input id="staff-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="Nama karyawan" />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1" htmlFor="staff-role">Peran</label>
              <select id="staff-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="px-3 py-2 rounded-lg border border-border bg-background text-sm">
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={creating} className="bg-sage text-white font-semibold text-sm px-5 py-2.5 rounded-xl hover:bg-sage-dark transition-colors disabled:opacity-50">
              {creating ? 'Membuat akun…' : 'Tambah & kirim email'}
            </button>
          </div>
          {formError && <p role="alert" className="text-danger text-xs font-semibold mt-3">{formError}</p>}
          {formNotice && <p role="status" className="text-sage-dark text-xs font-semibold mt-3">{formNotice}</p>}
        </form>

        <section>
          <h2 className="font-bold text-sm mb-3">Admin terdaftar</h2>
          {loading && <p className="text-sm text-ink-muted">Memuat…</p>}
          <div className="flex flex-col gap-3">
            {admins.map((a) => {
              const isSelf = a.uid === user.uid
              return (
                <div key={a.uid} className="bg-surface border border-border rounded-2xl p-4 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">
                      {a.name || '(tanpa nama)'}
                      {isSelf && <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-sage-light text-sage-dark">Kamu</span>}
                    </p>
                    <p className="text-xs text-ink-muted truncate">{a.email}</p>
                  </div>
                  <select
                    value={a.role}
                    disabled={isSelf}
                    onChange={(e) => changeRole(a, e.target.value)}
                    aria-label={`Peran ${a.name || a.email}`}
                    className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm disabled:opacity-60"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                    ))}
                  </select>
                  {!isSelf && a.email && (
                    <button className={btn} onClick={() => resend(a)}>Kirim ulang tautan</button>
                  )}
                  <button className={`${btn} text-danger`} disabled={isSelf} onClick={() => remove(a)}>
                    Cabut akses
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      </main>
    </div>
  )
}
