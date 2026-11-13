import { useEffect, useMemo, useState, useRef } from 'react'
import TopNav from '../components/TopNav.jsx'
import { useAdminAuth } from '../context/AdminAuthContext.jsx'
import {
  listenToAdmins,
  createStaffAccount,
  resendSetupEmail,
  setAdminRole,
  updateAdmin,
  removeAdmin,
} from '../api/admins.js'
import { ROLES, ROLE_LABEL, ROLE_DESC, canChangeRole, canRemove } from '../utils/adminRoles.js'
import { createAccountErrorMessage, isValidEmail } from '../utils/authErrors.js'
import { compressImage } from '../utils/image.js'

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20 transition-all'
const labelCls = 'block text-xs font-bold text-slate-800 mb-1.5'

function formatTimestamp(ts) {
  if (!ts) return 'Belum pernah login'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  if (isNaN(d.getTime())) return 'Baru dibuat'
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getInitials(name, email) {
  const str = (name || email || 'AD').trim()
  const parts = str.split(' ').filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return str.slice(0, 2).toUpperCase()
}

export default function AdminsAdmin() {
  const { user } = useAdminAuth()
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)

  // Form State
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'kasir',
    status: true,
    photoUrl: null,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [formNotice, setFormNotice] = useState('')

  // Filter & Search & Pagination Table
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [activeMenuId, setActiveMenuId] = useState(null)
  const pageSize = 6

  const formRef = useRef(null)

  useEffect(() => {
    return listenToAdmins((data) => {
      setAdmins(
        data.sort((a, b) =>
          (a.name || a.email || '').localeCompare(b.name || b.email || '')
        )
      )
      setLoading(false)
    })
  }, [])

  // Filter daftar admin
  const filteredAdmins = useMemo(() => {
    let list = admins
    if (roleFilter !== 'all') {
      list = list.filter((a) => a.role === roleFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(
        (a) =>
          (a.name || '').toLowerCase().includes(q) ||
          (a.email || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [admins, roleFilter, searchQuery])

  // Pagination
  const totalPages = Math.ceil(filteredAdmins.length / pageSize) || 1
  const paginatedAdmins = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredAdmins.slice(start, start + pageSize)
  }, [filteredAdmins, currentPage, pageSize])

  function resetForm() {
    setEditingId(null)
    setForm({
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: 'kasir',
      status: true,
      photoUrl: null,
    })
    setFormError('')
    setFormNotice('')
  }

  function handleStartEdit(admin) {
    setEditingId(admin.uid)
    setForm({
      name: admin.name || '',
      email: admin.email || '',
      password: '',
      confirmPassword: '',
      role: admin.role || 'kasir',
      status: admin.status !== 'nonaktif',
      photoUrl: admin.photoUrl || null,
    })
    setFormError('')
    setFormNotice('')
    formRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  async function handlePickPhoto(e) {
    const file = e.target?.files?.[0] || e
    if (e.target) e.target.value = ''
    if (!file) return
    setPhotoBusy(true)
    try {
      const r = await compressImage(file, { maxWidth: 400, quality: 0.8 })
      setForm((f) => ({ ...f, photoUrl: r.dataUrl }))
    } catch (err) {
      alert(err.message || 'Gagal memproses foto')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    setFormNotice('')

    const name = form.name.trim()
    const email = form.email.trim().toLowerCase()

    if (!name) return setFormError('Nama lengkap wajib diisi.')
    if (!isValidEmail(email)) return setFormError('Isi alamat email yang valid.')

    // Mode Edit
    if (editingId) {
      const target = admins.find((a) => a.uid === editingId)
      if (!target) return setFormError('Data admin tidak ditemukan.')

      if (form.role !== target.role) {
        const check = canChangeRole(admins, editingId, form.role, user.uid)
        if (!check.ok) return setFormError(check.reason)
      }

      setSubmitting(true)
      try {
        await updateAdmin(editingId, {
          name,
          role: form.role,
          status: form.status ? 'aktif' : 'nonaktif',
          photoUrl: form.photoUrl,
        })
        setFormNotice(`Perubahan data ${name} berhasil disimpan.`)
        resetForm()
      } catch (err) {
        setFormError('Gagal memperbarui: ' + err.message)
      } finally {
        setSubmitting(false)
      }
      return
    }

    // Mode Tambah Baru
    if (admins.some((a) => (a.email || '').toLowerCase() === email)) {
      return setFormError('Email ini sudah terdaftar sebagai akun admin.')
    }

    if (form.password && form.password.length < 8) {
      return setFormError('Password minimal 8 karakter.')
    }

    if (form.password && form.password !== form.confirmPassword) {
      return setFormError('Konfirmasi password tidak sesuai.')
    }

    setSubmitting(true)
    try {
      const { emailSent } = await createStaffAccount({
        email,
        name,
        role: form.role,
        password: form.password || null,
        status: form.status ? 'aktif' : 'nonaktif',
        photoUrl: form.photoUrl,
      })

      resetForm()
      setFormNotice(
        emailSent
          ? `Akun admin ${name} berhasil dibuat! Tautan aktivasi/login telah dikirim ke ${email}.`
          : `Akun admin ${name} berhasil dibuat dengan password yang ditentukan.`
      )
    } catch (err) {
      setFormError(createAccountErrorMessage(err.code) || err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleStatus(admin) {
    const isSelf = admin.uid === user.uid
    if (isSelf) return alert('Anda tidak bisa menonaktifkan akun sendiri.')
    const nextStatus = admin.status === 'nonaktif' ? 'aktif' : 'nonaktif'
    try {
      await updateAdmin(admin.uid, { status: nextStatus })
    } catch (err) {
      alert('Gagal mengubah status: ' + err.message)
    }
  }

  async function handleResend(admin) {
    try {
      await resendSetupEmail(admin.email)
      alert(`Tautan atur password telah dikirim ke ${admin.email}.`)
    } catch (err) {
      alert('Gagal mengirim tautan: ' + err.message)
    }
  }

  async function handleRemove(admin) {
    const check = canRemove(admins, admin.uid, user.uid)
    if (!check.ok) return alert(check.reason)
    if (
      !confirm(
        `Cabut akses admin ${admin.name || admin.email}? Akun tidak akan bisa lagi mengakses panel admin.`
      )
    )
      return
    try {
      await removeAdmin(admin.uid)
    } catch (err) {
      alert('Gagal mencabut akses: ' + err.message)
    }
  }

  return (
    <div className="min-h-screen bg-[#FBFDFB] text-slate-800">
      <TopNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ==================================================== */}
        {/* HEADER HALAMAN                                       */}
        {/* ==================================================== */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#EAF5EE] text-[#124734] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">manage_accounts</span>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                Kelola Admin
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Atur akun admin yang dapat mengakses sistem di outlet ini.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              resetForm()
              formRef.current?.scrollIntoView({ behavior: 'smooth' })
              document.getElementById('input-admin-name')?.focus()
            }}
            className="self-start sm:self-auto bg-[#124734] hover:bg-[#0c3124] text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>Tambah Admin</span>
          </button>
        </div>

        {/* ==================================================== */}
        {/* CARD 1: FORM TAMBAH / EDIT ADMIN (PERSIS MOCKUP)    */}
        {/* ==================================================== */}
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-xs"
          noValidate
        >
          {/* Header Form */}
          <div className="flex items-center gap-3 mb-5 pb-3 border-b border-slate-100">
            <div className="w-8 h-8 rounded-full bg-[#EAF5EE] text-[#124734] flex items-center justify-center text-sm">
              <span className="material-symbols-outlined text-[18px]">person</span>
            </div>
            <div>
              <h2 className="font-extrabold text-sm sm:text-base text-slate-900">
                {editingId ? 'Edit Data Admin' : 'Tambah Admin Baru'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {editingId
                  ? 'Perbarui data admin atau role hak akses akun ini.'
                  : 'Isi data admin untuk menambahkan akun baru.'}
              </p>
            </div>
          </div>

          {/* Grid Layout 3 Kolom Sesuai Mockup */}
          <div className="grid grid-cols-1 lg:grid-cols-[160px_1fr_260px] gap-6 items-start">
            {/* Kolom 1: Upload Foto */}
            <div>
              <label className={labelCls}>Foto Profil (Opsional)</label>
              {form.photoUrl ? (
                <div className="relative rounded-2xl border border-emerald-100 bg-[#F4F9F5] p-3 flex flex-col items-center justify-center text-center">
                  <img
                    src={form.photoUrl}
                    alt="Preview"
                    className="w-20 h-20 rounded-full object-cover border-2 border-white shadow-xs mb-2"
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-bold text-[#124734] hover:underline cursor-pointer">
                      Ganti
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePickPhoto}
                        disabled={photoBusy}
                        className="hidden"
                      />
                    </label>
                    <span className="text-slate-300">•</span>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, photoUrl: null }))}
                      className="text-[11px] font-bold text-red-500 hover:underline"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              ) : (
                <label
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const file = e.dataTransfer?.files?.[0]
                    if (file) handlePickPhoto(file)
                  }}
                  className="border-2 border-dashed border-[#CDE5D5] hover:border-[#124734] bg-[#F4F9F5] hover:bg-[#EBF5EE] rounded-2xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
                >
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePickPhoto}
                    disabled={photoBusy}
                    className="hidden"
                  />
                  <div className="w-10 h-10 rounded-full bg-white border border-emerald-100 text-emerald-700 flex items-center justify-center mb-2 shadow-2xs group-hover:scale-105 transition-transform">
                    <span className="material-symbols-outlined text-[20px]">photo_camera</span>
                  </div>
                  <p className="text-xs font-bold text-slate-800">
                    {photoBusy ? 'Memproses...' : 'Upload Foto'}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">JPG, PNG (maks. 2MB)</p>
                  <span className="mt-2.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-white border border-slate-200 text-slate-700 shadow-2xs">
                    Pilih File
                  </span>
                </label>
              )}
            </div>

            {/* Kolom 2: Form Inputs (Nama, Email, Password, Konfirmasi Password) */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Nama Lengkap */}
                <div>
                  <label className={labelCls}>
                    Nama Lengkap <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="input-admin-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={inputCls}
                    placeholder="Contoh: Budi Santoso"
                    required
                  />
                </div>

                {/* Email */}
                <div>
                  <label className={labelCls}>
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    disabled={!!editingId}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className={`${inputCls} ${
                      editingId ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''
                    }`}
                    placeholder="contoh@email.com"
                    required
                  />
                </div>
              </div>

              {/* Password & Konfirmasi Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Password */}
                <div>
                  <label className={labelCls}>
                    Password {editingId ? '(Opsional)' : <span className="text-red-500">*</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className={`${inputCls} pr-10`}
                      placeholder={
                        editingId ? 'Kosongkan jika tidak diubah' : 'Minimal 8 karakter'
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {showPassword ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Konfirmasi Password */}
                <div>
                  <label className={labelCls}>
                    Konfirmasi Password{' '}
                    {editingId ? '(Opsional)' : <span className="text-red-500">*</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={form.confirmPassword}
                      onChange={(e) =>
                        setForm({ ...form, confirmPassword: e.target.value })
                      }
                      className={`${inputCls} pr-10`}
                      placeholder="Ulangi password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {showConfirmPassword ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Kolom 3: Role, Status Akun & Tombol Aksi */}
            <div className="space-y-4">
              {/* Role Dropdown */}
              <div>
                <label className={labelCls}>
                  Role <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">
                    badge
                  </span>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20 transition-all appearance-none cursor-pointer"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">
                    expand_more
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {ROLE_DESC[form.role] || 'Hak akses akun operasional'}
                </p>
              </div>

              {/* Status Akun Toggle */}
              <div>
                <label className={labelCls}>Status Akun</label>
                <div className="flex items-center gap-3 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, status: !form.status })}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      form.status ? 'bg-[#124734]' : 'bg-slate-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        form.status ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className="text-xs font-bold text-slate-800">
                    {form.status ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
              </div>

              {/* Tombol Reset & Simpan */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 py-2.5 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">refresh</span>
                  <span>Reset</span>
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-[#124734] hover:bg-[#0c3124] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 shadow-xs"
                >
                  <span className="material-symbols-outlined text-[16px]">save</span>
                  <span>{submitting ? 'Menyimpan...' : 'Simpan Admin'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Feedback Pesan Form */}
          {formError && (
            <div className="mt-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold px-4 py-3 rounded-xl">
              <span className="material-symbols-outlined text-[18px]">error</span>
              <span>{formError}</span>
            </div>
          )}
          {formNotice && (
            <div className="mt-4 flex items-center gap-2 bg-[#EAF5EE] border border-emerald-200 text-[#124734] text-xs font-semibold px-4 py-3 rounded-xl">
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
              <span>{formNotice}</span>
            </div>
          )}
        </form>

        {/* ==================================================== */}
        {/* CARD 2: TABEL DAFTAR ADMIN (PERSIS MOCKUP)          */}
        {/* ==================================================== */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-xs">
          {/* Header Card & Filter Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#EAF5EE] text-[#124734] flex items-center justify-center">
                <span className="material-symbols-outlined text-[18px]">group</span>
              </div>
              <div>
                <h2 className="font-extrabold text-sm sm:text-base text-slate-900">
                  Daftar Admin
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Kelola daftar admin yang sudah terdaftar di outlet ini.
                </p>
              </div>
            </div>

            {/* Filter Search & Role */}
            <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
              {/* Search Bar */}
              <div className="relative flex-1 sm:w-64">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">
                  search
                </span>
                <input
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20 transition-all"
                  placeholder="Cari nama atau email..."
                />
              </div>

              {/* Dropdown Role Filter */}
              <div className="relative">
                <select
                  value={roleFilter}
                  onChange={(e) => {
                    setRoleFilter(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="pl-3.5 pr-8 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#124734] cursor-pointer appearance-none"
                >
                  <option value="all">Semua Role</option>
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="kasir">Kasir</option>
                </select>
                <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[16px] pointer-events-none">
                  expand_more
                </span>
              </div>
            </div>
          </div>

          {/* Tabel Data Admin */}
          <div className="overflow-x-auto -mx-5 sm:mx-0">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Nama</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Terakhir Login</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {loading && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <span className="material-symbols-outlined text-3xl animate-spin">
                        progress_activity
                      </span>
                      <p className="text-xs mt-2 font-medium">Memuat data admin...</p>
                    </td>
                  </tr>
                )}

                {!loading && paginatedAdmins.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <span className="material-symbols-outlined text-3xl">group_off</span>
                      <p className="text-xs font-bold text-slate-600 mt-2">
                        Tidak ada admin ditemukan
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Coba gunakan kata kunci pencarian atau filter lain.
                      </p>
                    </td>
                  </tr>
                )}

                {!loading &&
                  paginatedAdmins.map((admin) => {
                    const isSelf = admin.uid === user?.uid
                    const isActive = admin.status !== 'nonaktif'
                    const initials = getInitials(admin.name, admin.email)

                    return (
                      <tr
                        key={admin.uid}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        {/* Nama & Avatar */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            {admin.photoUrl ? (
                              <img
                                src={admin.photoUrl}
                                alt={admin.name}
                                className="w-9 h-9 rounded-full object-cover border border-slate-200/80 shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-[#EAF5EE] text-[#124734] font-bold text-xs flex items-center justify-center shrink-0 border border-emerald-100">
                                {initials}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 truncate flex items-center gap-1.5">
                                <span>{admin.name || '(Tanpa Nama)'}</span>
                                {isSelf && (
                                  <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-[#EAF5EE] text-[#124734] border border-emerald-200">
                                    Kamu
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Email */}
                        <td className="py-3.5 px-4 font-mono text-xs text-slate-600">
                          {admin.email}
                        </td>

                        {/* Role Badge */}
                        <td className="py-3.5 px-4">
                          {admin.role === 'owner' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                              <span>👑</span>
                              <span>Owner</span>
                            </span>
                          )}
                          {admin.role === 'admin' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                              <span className="material-symbols-outlined text-[13px]">shield_person</span>
                              <span>Admin</span>
                            </span>
                          )}
                          {admin.role === 'kasir' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                              <span className="material-symbols-outlined text-[13px]">person</span>
                              <span>Kasir</span>
                            </span>
                          )}
                        </td>

                        {/* Status Toggle */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={isSelf}
                              onClick={() => handleToggleStatus(admin)}
                              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
                                isActive ? 'bg-[#124734]' : 'bg-slate-300'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                  isActive ? 'translate-x-4' : 'translate-x-0'
                                }`}
                              />
                            </button>
                            <span
                              className={`text-xs font-semibold ${
                                isActive ? 'text-slate-800' : 'text-slate-400'
                              }`}
                            >
                              {isActive ? 'Aktif' : 'Nonaktif'}
                            </span>
                          </div>
                        </td>

                        {/* Terakhir Login */}
                        <td className="py-3.5 px-4 text-xs text-slate-500">
                          {formatTimestamp(admin.lastLoginAt || admin.createdAt)}
                        </td>

                        {/* Tombol Aksi */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5 relative">
                            {/* Tombol Edit */}
                            <button
                              onClick={() => handleStartEdit(admin)}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1 transition-colors"
                              title="Edit data admin"
                            >
                              <span className="material-symbols-outlined text-[15px]">edit</span>
                              <span>Edit</span>
                            </button>

                            {/* Tombol Menu Dropdown (3 dots) */}
                            <button
                              onClick={() =>
                                setActiveMenuId(
                                  activeMenuId === admin.uid ? null : admin.uid
                                )
                              }
                              className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 flex items-center justify-center transition-colors"
                              title="Pilihan lainnya"
                            >
                              <span className="material-symbols-outlined text-[18px]">
                                more_vert
                              </span>
                            </button>

                            {/* Menu Dropdown Popup */}
                            {activeMenuId === admin.uid && (
                              <div className="absolute right-0 top-10 z-30 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 text-left text-xs">
                                <button
                                  onClick={() => {
                                    setActiveMenuId(null)
                                    handleResend(admin)
                                  }}
                                  className="w-full px-3 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors font-medium"
                                >
                                  <span className="material-symbols-outlined text-[16px] text-slate-400">
                                    mail
                                  </span>
                                  <span>Kirim Ulang Tautan</span>
                                </button>

                                {!isSelf && (
                                  <button
                                    onClick={() => {
                                      setActiveMenuId(null)
                                      handleRemove(admin)
                                    }}
                                    className="w-full px-3 py-2 text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors font-semibold"
                                  >
                                    <span className="material-symbols-outlined text-[16px] text-red-500">
                                      person_remove
                                    </span>
                                    <span>Cabut Akses</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>

          {/* Footer Pagination */}
          {!loading && filteredAdmins.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-5 mt-3 border-t border-slate-100 text-xs text-slate-500">
              <p>
                Menampilkan 1–{paginatedAdmins.length} dari {filteredAdmins.length} admin
              </p>
              <div className="flex items-center gap-1.5 self-center sm:self-auto">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center disabled:opacity-40 transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                      currentPage === page
                        ? 'bg-[#124734] text-white shadow-xs'
                        : 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center disabled:opacity-40 transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
