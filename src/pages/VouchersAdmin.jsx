import { useEffect, useMemo, useState, useRef } from 'react'
import TopNav from '../components/TopNav.jsx'
import {
  listenToVouchersAdmin,
  saveVoucher,
  deleteVoucher,
  toggleVoucherStatus,
  listenToRedemptionsAdmin,
} from '../api/vouchers.js'
import { compressImage } from '../utils/image.js'

// Format Rupiah
const rupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID')

// Format Tanggal
function formatDateIndo(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTimeIndo(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Topping Pilihan
const AVAILABLE_TOPPINGS = [
  'Grass Jelly (Cincau Alami)',
  'Pearl / Boba',
  'Nata de Coco Crunchy',
  'Aloe Vera Organik',
  'Egg Pudding Sutra',
]

export default function VouchersAdmin() {
  const [vouchers, setVouchers] = useState([])
  const [redemptions, setRedemptions] = useState([])
  const [loading, setLoading] = useState(true)

  // Tab State: 'list' | 'create' | 'history'
  const [activeTab, setActiveTab] = useState('list')

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')

  // Redemptions Filter
  const [redemptionSearch, setRedemptionSearch] = useState('')
  const [redemptionStatusFilter, setRedemptionStatusFilter] = useState('all')

  // Detail Modal
  const [selectedVoucher, setSelectedVoucher] = useState(null)

  // Confirmation Modal
  const [confirmDialog, setConfirmDialog] = useState(null) // { title, message, onConfirm, confirmText, danger }

  // Toast Notice
  const [toast, setToast] = useState(null)

  // Form State
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    imageUrl: '',
    rewardType: 'fixed_discount', // 'fixed_discount' | 'free_topping'
    discountAmount: 5000,
    freeToppingName: 'Grass Jelly (Cincau Alami)',
    pointsRequired: 250,
    quota: 500,
    maxPerCustomer: 1,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    validityType: 'duration', // 'duration' | 'fixed_date'
    validityDays: 7,
    fixedExpiryDate: '',
    minPurchase: 25000,
    allowBundle: true,
    active: true,
  })
  const [formErrors, setFormErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)

  // Ref
  const fileInputRef = useRef(null)

  useEffect(() => {
    const unsubVouchers = listenToVouchersAdmin((data) => {
      setVouchers(data)
      setLoading(false)
    })
    const unsubRedemptions = listenToRedemptionsAdmin((data) => {
      setRedemptions(data)
    })
    return () => {
      unsubVouchers && unsubVouchers()
      unsubRedemptions && unsubRedemptions()
    }
  }, [])

  function showToast(message, type = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  // Summary Metrics
  const summary = useMemo(() => {
    const total = vouchers.length
    const active = vouchers.filter((v) => v.active && v.status === 'active').length
    const scheduled = vouchers.filter((v) => v.status === 'scheduled').length
    const inactive = vouchers.filter((v) => !v.active || v.status === 'inactive' || v.status === 'out_of_stock' || v.status === 'expired').length
    const totalRedeemed = vouchers.reduce((acc, v) => acc + (v.redeemedCount || 0), 0)
    return { total, active, scheduled, inactive, totalRedeemed }
  }, [vouchers])

  // Filtered Vouchers
  const filteredVouchers = useMemo(() => {
    let list = [...vouchers]
    if (typeFilter !== 'all') {
      list = list.filter((v) => v.rewardType === typeFilter)
    }
    if (statusFilter !== 'all') {
      list = list.filter((v) => v.status === statusFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          (v.description || '').toLowerCase().includes(q)
      )
    }
    if (sortBy === 'newest') {
      list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    } else if (sortBy === 'most_redeemed') {
      list.sort((a, b) => (b.redeemedCount || 0) - (a.redeemedCount || 0))
    } else if (sortBy === 'points_asc') {
      list.sort((a, b) => (a.pointsRequired || 0) - (b.pointsRequired || 0))
    } else if (sortBy === 'points_desc') {
      list.sort((a, b) => (b.pointsRequired || 0) - (a.pointsRequired || 0))
    }
    return list
  }, [vouchers, typeFilter, statusFilter, searchQuery, sortBy])

  // Filtered Redemptions
  const filteredRedemptions = useMemo(() => {
    let list = [...redemptions]
    if (redemptionStatusFilter !== 'all') {
      list = list.filter((r) => r.status === redemptionStatusFilter)
    }
    if (redemptionSearch.trim()) {
      const q = redemptionSearch.toLowerCase().trim()
      list = list.filter(
        (r) =>
          r.customerName.toLowerCase().includes(q) ||
          r.customerId.toLowerCase().includes(q) ||
          r.voucherName.toLowerCase().includes(q)
      )
    }
    return list
  }, [redemptions, redemptionStatusFilter, redemptionSearch])

  // Form Handlers
  function resetForm() {
    setEditingId(null)
    setFormData({
      name: '',
      description: '',
      imageUrl: '',
      rewardType: 'fixed_discount',
      discountAmount: 5000,
      freeToppingName: 'Grass Jelly (Cincau Alami)',
      pointsRequired: 250,
      quota: 500,
      maxPerCustomer: 1,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      validityType: 'duration',
      validityDays: 7,
      fixedExpiryDate: '',
      minPurchase: 25000,
      allowBundle: true,
      active: true,
    })
    setFormErrors({})
  }

  function handleStartCreate() {
    resetForm()
    setActiveTab('create')
  }

  function handleStartEdit(voucher) {
    setEditingId(voucher.id)
    setFormData({
      name: voucher.name || '',
      description: voucher.description || '',
      imageUrl: voucher.imageUrl || '',
      rewardType: voucher.rewardType || 'fixed_discount',
      discountAmount: voucher.discountAmount || 5000,
      freeToppingName: voucher.freeToppingName || 'Grass Jelly (Cincau Alami)',
      pointsRequired: voucher.pointsRequired || 250,
      quota: voucher.quota || 500,
      maxPerCustomer: voucher.maxPerCustomer || 1,
      startDate: voucher.startDate || new Date().toISOString().split('T')[0],
      endDate: voucher.endDate || '',
      validityType: voucher.validityType || 'duration',
      validityDays: voucher.validityDays || 7,
      fixedExpiryDate: voucher.fixedExpiryDate || '',
      minPurchase: voucher.minPurchase || 25000,
      allowBundle: voucher.allowBundle !== false,
      active: voucher.active !== false,
    })
    setFormErrors({})
    setActiveTab('create')
  }

  function handleDuplicate(voucher) {
    setEditingId(null)
    setFormData({
      ...voucher,
      id: undefined,
      name: `${voucher.name} (Salinan)`,
      redeemedCount: 0,
      usedCount: 0,
      createdAt: undefined,
    })
    setFormErrors({})
    setActiveTab('create')
    showToast(`Draf dibuat dari salinan "${voucher.name}". Silakan sesuaikan dan simpan.`, 'info')
  }

  async function handlePickImage(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoBusy(true)
    try {
      const res = await compressImage(file, { maxWidth: 600, quality: 0.85 })
      setFormData((prev) => ({ ...prev, imageUrl: res.dataUrl }))
    } catch (err) {
      alert('Gagal mengompres gambar: ' + err.message)
    } finally {
      setPhotoBusy(false)
    }
  }

  function validateForm() {
    const errs = {}
    if (!formData.name.trim()) errs.name = 'Nama voucher wajib diisi'
    if (!formData.pointsRequired || Number(formData.pointsRequired) <= 0) {
      errs.pointsRequired = 'Poin penukaran harus lebih besar dari 0'
    }
    if (!formData.quota || Number(formData.quota) <= 0) {
      errs.quota = 'Total kuota voucher harus lebih besar dari 0'
    }
    if (formData.rewardType === 'fixed_discount') {
      if (!formData.discountAmount || Number(formData.discountAmount) <= 0) {
        errs.discountAmount = 'Nominal potongan harga wajib diisi dan > 0'
      }
    } else if (formData.rewardType === 'free_topping') {
      if (!formData.freeToppingName) {
        errs.freeToppingName = 'Pilih salah satu topping yang digratiskan'
      }
    }
    if (!formData.startDate) errs.startDate = 'Tanggal mulai penukaran wajib diisi'
    if (!formData.endDate) errs.endDate = 'Tanggal selesai penukaran wajib diisi'
    if (formData.startDate && formData.endDate && formData.startDate > formData.endDate) {
      errs.endDate = 'Tanggal selesai tidak boleh sebelum tanggal mulai'
    }
    if (formData.validityType === 'duration' && (!formData.validityDays || Number(formData.validityDays) <= 0)) {
      errs.validityDays = 'Durasi masa berlaku hari harus > 0'
    }
    if (formData.validityType === 'fixed_date' && !formData.fixedExpiryDate) {
      errs.fixedExpiryDate = 'Pilih tanggal kadaluwarsa pasti'
    }
    setFormErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmitForm(e) {
    e.preventDefault()
    if (!validateForm()) {
      showToast('Mohon lengkapi isian form dengan benar.', 'error')
      return
    }

    setSaving(true)
    try {
      const now = new Date().toISOString()
      const isScheduled = formData.startDate > now.split('T')[0]
      const status = !formData.active ? 'inactive' : isScheduled ? 'scheduled' : 'active'

      const existingVoucher = editingId ? vouchers.find((v) => v.id === editingId) : null

      const payload = {
        ...formData,
        id: editingId || 'vcr-' + Date.now(),
        status,
        discountAmount: formData.rewardType === 'fixed_discount' ? Number(formData.discountAmount) : null,
        freeToppingName: formData.rewardType === 'free_topping' ? formData.freeToppingName : null,
        pointsRequired: Number(formData.pointsRequired),
        quota: Number(formData.quota),
        maxPerCustomer: Number(formData.maxPerCustomer || 1),
        minPurchase: Number(formData.minPurchase || 0),
        validityDays: formData.validityType === 'duration' ? Number(formData.validityDays) : null,
        redeemedCount: existingVoucher?.redeemedCount || 0,
        usedCount: existingVoucher?.usedCount || 0,
        createdAt: existingVoucher?.createdAt || now,
      }

      await saveVoucher(payload)
      showToast(
        editingId
          ? `Voucher "${payload.name}" berhasil diperbarui!`
          : `Voucher "${payload.name}" berhasil diterbitkan ke katalog pelanggan!`
      )
      resetForm()
      setActiveTab('list')
    } catch (err) {
      showToast('Gagal menyimpan voucher: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function handlePromptToggleStatus(voucher) {
    const nextActive = !voucher.active
    setConfirmDialog({
      title: nextActive ? 'Aktifkan Voucher?' : 'Nonaktifkan Voucher?',
      message: nextActive
        ? `Voucher "${voucher.name}" akan kembali muncul di katalog reward dan siap ditukarkan pelanggan.`
        : `Nonaktifkan voucher "${voucher.name}"? Pelanggan tidak akan dapat menukarkan poin untuk voucher ini lagi. Voucher yang sudah tersimpan di dompet pelanggan tetap berlaku hingga masa kedaluwarsa.`,
      confirmText: nextActive ? 'Ya, Aktifkan' : 'Ya, Nonaktifkan',
      danger: !nextActive,
      onConfirm: async () => {
        await toggleVoucherStatus(voucher.id, nextActive)
        showToast(
          nextActive
            ? `Voucher "${voucher.name}" diaktifkan.`
            : `Voucher "${voucher.name}" telah dinonaktifkan.`
        )
        setConfirmDialog(null)
      },
    })
  }

  function handlePromptDelete(voucher) {
    if (voucher.redeemedCount > 0) {
      alert('Voucher ini telah memiliki riwayat penukaran oleh pelanggan dan tidak dapat dihapus. Silakan nonaktifkan voucher ini.')
      return
    }
    setConfirmDialog({
      title: 'Hapus Voucher?',
      message: `Apakah Anda yakin ingin menghapus voucher "${voucher.name}" secara permanen? Tindakan ini tidak dapat dibatalkan.`,
      confirmText: 'Hapus Permanen',
      danger: true,
      onConfirm: async () => {
        await deleteVoucher(voucher.id)
        showToast(`Voucher "${voucher.name}" berhasil dihapus.`, 'info')
        setConfirmDialog(null)
        if (selectedVoucher?.id === voucher.id) setSelectedVoucher(null)
      },
    })
  }

  function exportRedemptionsCSV() {
    if (filteredRedemptions.length === 0) {
      alert('Tidak ada data riwayat penukaran untuk diexport.')
      return
    }
    const headers = ['ID Pelanggan', 'Nama Pelanggan', 'Voucher', 'Poin Dipotong', 'Waktu Penukaran', 'Batas Kadaluwarsa', 'Status']
    const rows = filteredRedemptions.map((r) => [
      r.customerId,
      `"${r.customerName}"`,
      `"${r.voucherName}"`,
      r.pointsDeducted,
      `"${formatDateTimeIndo(r.redeemedAt)}"`,
      `"${formatDateTimeIndo(r.expiresAt)}"`,
      r.status,
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `riwayat-penukaran-voucher-${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="min-h-screen bg-[#FBFDFB] text-slate-800">
      <TopNav />

      {/* Floating Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 text-sm font-semibold transition-all duration-300 animate-slide-up border ${
            toast.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : toast.type === 'info'
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-[#EAF5EE] border-[#C8E6C9] text-[#124734]'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">
            {toast.type === 'error' ? 'error' : toast.type === 'info' ? 'info' : 'check_circle'}
          </span>
          <span>{toast.message}</span>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ==================================================== */}
        {/* HEADER MODUL UTAMA                                   */}
        {/* ==================================================== */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-[#EAF5EE] text-[#124734] flex items-center justify-center shrink-0 border border-[#124734]/15 shadow-2xs">
              <span className="material-symbols-outlined text-[26px]">loyalty</span>
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight font-serif">
                  Voucher &amp; Rewards
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#124734]/10 text-[#124734]">
                  Loyalty Points
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Atur reward voucher yang dapat ditukarkan pelanggan menggunakan poin loyalitas di outlet Anda.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {activeTab !== 'create' && (
              <button
                type="button"
                onClick={handleStartCreate}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#124734] hover:bg-[#092D20] text-white text-xs sm:text-sm font-bold shadow-sm transition-all active:scale-95"
              >
                <span className="material-symbols-outlined text-[18px]">add_circle</span>
                <span>Buat Voucher Baru</span>
              </button>
            )}
          </div>
        </div>

        {/* ==================================================== */}
        {/* TAB NAVIGASI INTERNAL MODUL                         */}
        {/* ==================================================== */}
        <div className="flex items-center gap-2 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('list')}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold transition-all relative flex items-center gap-2 ${
              activeTab === 'list'
                ? 'text-[#124734]'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">list_alt</span>
            <span>Daftar Voucher</span>
            <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600 font-extrabold">
              {vouchers.length}
            </span>
            {activeTab === 'list' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#124734] rounded-t-full" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              if (activeTab !== 'create') handleStartCreate()
            }}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold transition-all relative flex items-center gap-2 ${
              activeTab === 'create'
                ? 'text-[#124734]'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {editingId ? 'edit_note' : 'add_circle_outline'}
            </span>
            <span>{editingId ? 'Edit Konfigurasi' : 'Buat Voucher'}</span>
            {activeTab === 'create' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#124734] rounded-t-full" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold transition-all relative flex items-center gap-2 ${
              activeTab === 'history'
                ? 'text-[#124734]'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">history</span>
            <span>Riwayat Penukaran</span>
            <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600 font-extrabold">
              {redemptions.length}
            </span>
            {activeTab === 'history' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#124734] rounded-t-full" />
            )}
          </button>
        </div>

        {/* ==================================================== */}
        {/* KONTEN TAB 1: DAFTAR VOUCHER                         */}
        {/* ==================================================== */}
        {activeTab === 'list' && (
          <div className="space-y-6">
            {/* 5 Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Total Voucher
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-slate-900">{summary.total}</span>
                  <span className="text-xs text-slate-500 font-medium">Item</span>
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">Semua koleksi reward</span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-emerald-100 bg-emerald-50/20 shadow-2xs">
                <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
                  Voucher Aktif
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-emerald-900">{summary.active}</span>
                  <span className="text-xs text-emerald-700 font-medium">Siap Klaim</span>
                </div>
                <span className="text-[11px] text-emerald-600 mt-1 block">Tampil di katalog</span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-amber-100 bg-amber-50/20 shadow-2xs">
                <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider block">
                  Terjadwal
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-amber-900">{summary.scheduled}</span>
                  <span className="text-xs text-amber-700 font-medium">Mendatang</span>
                </div>
                <span className="text-[11px] text-amber-600 mt-1 block">Rilis terjadwal</span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Tidak Aktif / Habis
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-slate-600">{summary.inactive}</span>
                  <span className="text-xs text-slate-500 font-medium">Item</span>
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">Nonaktif atau sold out</span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-[#124734]/15 bg-[#EAF5EE]/30 shadow-2xs col-span-2 sm:col-span-1">
                <span className="text-[11px] font-bold text-[#124734] uppercase tracking-wider block">
                  Total Penukaran
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-[#124734]">
                    {summary.totalRedeemed.toLocaleString('id-ID')}
                  </span>
                  <span className="text-xs text-[#124734] font-medium">Kali</span>
                </div>
                <span className="text-[11px] text-[#124734]/70 mt-1 block">Poin loyalitas terpakai</span>
              </div>
            </div>

            {/* Filter & Toolbar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                  search
                </span>
                <input
                  type="text"
                  placeholder="Cari voucher reward..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                {/* Filter Tipe */}
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700 focus:outline-none focus:border-[#124734]"
                >
                  <option value="all">Semua Tipe Reward</option>
                  <option value="fixed_discount">Potongan Tetap</option>
                  <option value="free_topping">Gratis Topping</option>
                </select>

                {/* Filter Status */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700 focus:outline-none focus:border-[#124734]"
                >
                  <option value="all">Semua Status</option>
                  <option value="active">Aktif</option>
                  <option value="scheduled">Terjadwal</option>
                  <option value="out_of_stock">Kuota Habis</option>
                  <option value="inactive">Nonaktif</option>
                </select>

                {/* Sort By */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700 focus:outline-none focus:border-[#124734]"
                >
                  <option value="newest">Terbaru</option>
                  <option value="most_redeemed">Paling Banyak Ditukar</option>
                  <option value="points_asc">Poin Terendah</option>
                  <option value="points_desc">Poin Tertinggi</option>
                </select>
              </div>
            </div>

            {/* Voucher Table */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-4">Nama Voucher</th>
                      <th className="py-3 px-3">Tipe Reward</th>
                      <th className="py-3 px-3">Poin Ditukar</th>
                      <th className="py-3 px-3">Kuota / Limit</th>
                      <th className="py-3 px-3">Terpakai</th>
                      <th className="py-3 px-3">Periode</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                    {loading ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-400">
                          Memuat data voucher reward...
                        </td>
                      </tr>
                    ) : filteredVouchers.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center">
                          <div className="max-w-xs mx-auto space-y-2">
                            <span className="material-symbols-outlined text-4xl text-slate-300">
                              confirmation_number
                            </span>
                            <p className="text-sm font-bold text-slate-700">Tidak ada voucher ditemukan</p>
                            <p className="text-xs text-slate-400">
                              Coba ubah kata kunci pencarian atau buat voucher reward baru.
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredVouchers.map((v) => {
                        const isDiscount = v.rewardType === 'fixed_discount'
                        const isExpired = v.endDate && new Date(v.endDate) < new Date()
                        const isOutOfStock = v.quota && v.redeemedCount >= v.quota
                        const statusBadge = !v.active ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            Nonaktif
                          </span>
                        ) : isOutOfStock ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            Kuota Habis
                          </span>
                        ) : isExpired ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                            Kadaluwarsa
                          </span>
                        ) : v.status === 'scheduled' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            Terjadwal
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                            Aktif
                          </span>
                        )

                        return (
                          <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">
                            {/* Nama & Thumbnail */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 border border-slate-200/80 shrink-0">
                                  {v.imageUrl ? (
                                    <img src={v.imageUrl} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[#124734]/50">
                                      <span className="material-symbols-outlined text-[20px]">loyalty</span>
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <span className="font-bold text-slate-900 block truncate hover:text-[#124734]">
                                    {v.name}
                                  </span>
                                  <span className="text-[11px] text-slate-400 block truncate max-w-xs">
                                    {v.description || 'Tanpa deskripsi'}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Tipe Reward */}
                            <td className="py-3.5 px-3">
                              {isDiscount ? (
                                <div>
                                  <span className="font-bold text-slate-800 text-xs block">
                                    Potongan Tetap
                                  </span>
                                  <span className="text-[11px] text-[#124734] font-extrabold">
                                    {rupiah(v.discountAmount)}
                                  </span>
                                </div>
                              ) : (
                                <div>
                                  <span className="font-bold text-slate-800 text-xs block">
                                    Gratis Topping
                                  </span>
                                  <span className="text-[11px] text-amber-700 font-extrabold block truncate max-w-[140px]">
                                    {v.freeToppingName}
                                  </span>
                                </div>
                              )}
                            </td>

                            {/* Poin Dibutuhkan */}
                            <td className="py-3.5 px-3">
                              <span className="inline-flex items-center gap-1 font-extrabold text-amber-800 bg-amber-50/80 px-2.5 py-1 rounded-lg border border-amber-200/60 text-xs">
                                <span className="material-symbols-outlined text-[14px]">stars</span>
                                {v.pointsRequired} Poin
                              </span>
                            </td>

                            {/* Kuota / Limit */}
                            <td className="py-3.5 px-3 text-slate-700 text-xs">
                              <span className="font-bold block">{v.quota.toLocaleString('id-ID')} Kuota</span>
                              <span className="text-[10px] text-slate-400">
                                Maks. {v.maxPerCustomer || 1} / Akun
                              </span>
                            </td>

                            {/* Terpakai */}
                            <td className="py-3.5 px-3 text-xs">
                              <span className="font-bold text-slate-800">
                                {v.redeemedCount || 0} Kali
                              </span>
                              <div className="w-20 h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden">
                                <div
                                  className="h-full bg-[#124734] rounded-full"
                                  style={{
                                    width: `${Math.min(100, ((v.redeemedCount || 0) / (v.quota || 1)) * 100)}%`,
                                  }}
                                />
                              </div>
                            </td>

                            {/* Periode */}
                            <td className="py-3.5 px-3 text-slate-600 text-xs">
                              <span className="block">{formatDateIndo(v.startDate)}</span>
                              <span className="text-[11px] text-slate-400">s.d {formatDateIndo(v.endDate)}</span>
                            </td>

                            {/* Status */}
                            <td className="py-3.5 px-3">{statusBadge}</td>

                            {/* Aksi */}
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  title="Lihat Detail & Performa"
                                  onClick={() => setSelectedVoucher(v)}
                                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
                                >
                                  <span className="material-symbols-outlined text-[18px]">visibility</span>
                                </button>

                                <button
                                  type="button"
                                  title="Edit Konfigurasi"
                                  onClick={() => handleStartEdit(v)}
                                  className="p-1.5 rounded-lg hover:bg-[#EAF5EE] text-[#124734] transition-colors"
                                >
                                  <span className="material-symbols-outlined text-[18px]">edit</span>
                                </button>

                                <button
                                  type="button"
                                  title="Duplikat Voucher"
                                  onClick={() => handleDuplicate(v)}
                                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors"
                                >
                                  <span className="material-symbols-outlined text-[18px]">content_copy</span>
                                </button>

                                <button
                                  type="button"
                                  title={v.active ? 'Nonaktifkan' : 'Aktifkan'}
                                  onClick={() => handlePromptToggleStatus(v)}
                                  className={`p-1.5 rounded-lg transition-colors ${
                                    v.active
                                      ? 'hover:bg-amber-50 text-amber-600'
                                      : 'hover:bg-emerald-50 text-emerald-600'
                                  }`}
                                >
                                  <span className="material-symbols-outlined text-[18px]">
                                    {v.active ? 'pause_circle' : 'play_circle'}
                                  </span>
                                </button>

                                {v.redeemedCount === 0 && (
                                  <button
                                    type="button"
                                    title="Hapus Voucher"
                                    onClick={() => handlePromptDelete(v)}
                                    className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500 transition-colors"
                                  >
                                    <span className="material-symbols-outlined text-[18px]">delete</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Table Footer */}
              <div className="py-3 px-4 bg-slate-50/70 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
                <span>Menampilkan {filteredVouchers.length} dari {vouchers.length} reward voucher</span>
                <span className="text-[11px] text-slate-400">Justmine Tea Loyalty Engine</span>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* KONTEN TAB 2: BUAT / EDIT VOUCHER + LIVE PREVIEW     */}
        {/* ==================================================== */}
        {activeTab === 'create' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Form Konfigurasi (Kolom Kiri 65% / 7 Kolom) */}
            <form onSubmit={handleSubmitForm} className="lg:col-span-7 space-y-6">
              <div className="bg-white p-5 sm:p-7 rounded-2xl border border-slate-200/80 shadow-2xs space-y-6">
                {/* Judul Form */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900">
                      {editingId ? 'Edit Konfigurasi Reward Voucher' : 'Formulir Buat Voucher Baru'}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Tentukan syarat poin, jenis benefit, kuota, dan masa berlaku voucher.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      resetForm()
                      setActiveTab('list')
                    }}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                  >
                    Batal
                  </button>
                </div>

                {/* Bagian 1: Informasi Dasar */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#A87950] flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-[#A87950]/15 text-[#A87950] flex items-center justify-center text-[10px]">
                      1
                    </span>
                    Informasi Dasar Voucher
                  </h3>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Nama Voucher <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Tea Saver Rp5.000 atau Gratis Grass Jelly"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20"
                    />
                    {formErrors.name && (
                      <span className="text-[11px] text-rose-500 mt-1 block">{formErrors.name}</span>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Deskripsi Singkat (Tampil di Customer App)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Tuliskan benefit singkat untuk menarik minat pelanggan menukar poin..."
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Thumbnail Foto Voucher (Opsional)
                    </label>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                        {formData.imageUrl ? (
                          <img src={formData.imageUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="material-symbols-outlined text-slate-400 text-[24px]">
                            add_photo_alternate
                          </span>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handlePickImage}
                          className="hidden"
                        />
                        <button
                          type="button"
                          disabled={photoBusy}
                          onClick={() => fileInputRef.current?.click()}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                        >
                          {photoBusy ? 'Memproses...' : 'Pilih Gambar'}
                        </button>
                        <p className="text-[11px] text-slate-400">Format PNG, WebP, JPG. Rekomendasi rasio 1:1.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bagian 2: Tipe Reward */}
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#A87950] flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-[#A87950]/15 text-[#A87950] flex items-center justify-center text-[10px]">
                      2
                    </span>
                    Tipe Reward
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Option 1: Fixed Discount */}
                    <label
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        formData.rewardType === 'fixed_discount'
                          ? 'border-[#124734] bg-[#EAF5EE]/30'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="rewardType"
                        value="fixed_discount"
                        checked={formData.rewardType === 'fixed_discount'}
                        onChange={() => setFormData({ ...formData, rewardType: 'fixed_discount' })}
                        className="hidden"
                      />
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs sm:text-sm text-slate-900 block">
                          Potongan Tetap (Fixed Discount)
                        </span>
                        <span
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            formData.rewardType === 'fixed_discount'
                              ? 'border-[#124734] bg-[#124734]'
                              : 'border-slate-300'
                          }`}
                        >
                          {formData.rewardType === 'fixed_discount' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Memberikan potongan harga langsung (contoh: Rp2.000, Rp5.000, Rp10.000).
                      </p>
                    </label>

                    {/* Option 2: Free Topping */}
                    <label
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        formData.rewardType === 'free_topping'
                          ? 'border-[#124734] bg-[#EAF5EE]/30'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="rewardType"
                        value="free_topping"
                        checked={formData.rewardType === 'free_topping'}
                        onChange={() => setFormData({ ...formData, rewardType: 'free_topping' })}
                        className="hidden"
                      />
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs sm:text-sm text-slate-900 block">
                          Gratis Topping (Free Topping)
                        </span>
                        <span
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            formData.rewardType === 'free_topping'
                              ? 'border-[#124734] bg-[#124734]'
                              : 'border-slate-300'
                          }`}
                        >
                          {formData.rewardType === 'free_topping' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Gratis satu jenis topping tambahan ke minuman pesanan pelanggan.
                      </p>
                    </label>
                  </div>

                  {/* Dynamic Value Input */}
                  {formData.rewardType === 'fixed_discount' ? (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Nominal Potongan Harga (Rupiah) <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                          Rp
                        </span>
                        <input
                          type="number"
                          step="1000"
                          placeholder="5000"
                          value={formData.discountAmount || ''}
                          onChange={(e) => setFormData({ ...formData, discountAmount: e.target.value })}
                          className="w-full pl-10 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#124734]"
                        />
                      </div>
                      {formErrors.discountAmount && (
                        <span className="text-[11px] text-rose-500 mt-1 block">
                          {formErrors.discountAmount}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Pilih Topping yang Digratiskan <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={formData.freeToppingName}
                        onChange={(e) => setFormData({ ...formData, freeToppingName: e.target.value })}
                        className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-[#124734]"
                      >
                        {AVAILABLE_TOPPINGS.map((top) => (
                          <option key={top} value={top}>
                            {top}
                          </option>
                        ))}
                      </select>
                      {formErrors.freeToppingName && (
                        <span className="text-[11px] text-rose-500 mt-1 block">
                          {formErrors.freeToppingName}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Warning: No Free Drink */}
                  <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                    <span className="material-symbols-outlined text-[18px] text-amber-700 shrink-0 mt-0.5">
                      info
                    </span>
                    <p className="leading-relaxed">
                      <strong>Kebijakan Margin Justmine:</strong> Sistem hanya mendukung Potongan Tetap dan Gratis Topping. Tidak diperkenankan membuat reward minuman gratis penuh (free drinks).
                    </p>
                  </div>
                </div>

                {/* Bagian 3: Poin & Kuota */}
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#A87950] flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-[#A87950]/15 text-[#A87950] flex items-center justify-center text-[10px]">
                      3
                    </span>
                    Pengaturan Poin Loyalitas &amp; Kuota
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Poin Dibutuhkan <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        placeholder="Contoh: 250"
                        value={formData.pointsRequired || ''}
                        onChange={(e) => setFormData({ ...formData, pointsRequired: e.target.value })}
                        className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#124734]"
                      />
                      {formErrors.pointsRequired && (
                        <span className="text-[11px] text-rose-500 mt-1 block">
                          {formErrors.pointsRequired}
                        </span>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Total Kuota Voucher <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        placeholder="Contoh: 500"
                        value={formData.quota || ''}
                        onChange={(e) => setFormData({ ...formData, quota: e.target.value })}
                        className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#124734]"
                      />
                      {formErrors.quota && (
                        <span className="text-[11px] text-rose-500 mt-1 block">{formErrors.quota}</span>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Maks. per Akun
                      </label>
                      <input
                        type="number"
                        placeholder="1"
                        value={formData.maxPerCustomer || 1}
                        onChange={(e) => setFormData({ ...formData, maxPerCustomer: e.target.value })}
                        className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#124734]"
                      />
                    </div>
                  </div>
                </div>

                {/* Bagian 4: Masa Berlaku & Periode */}
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#A87950] flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-[#A87950]/15 text-[#A87950] flex items-center justify-center text-[10px]">
                      4
                    </span>
                    Masa Berlaku &amp; Periode Penukaran
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Mulai Penukaran <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={formData.startDate}
                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                        className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#124734]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Selesai Penukaran <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={formData.endDate}
                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                        className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#124734]"
                      />
                      {formErrors.endDate && (
                        <span className="text-[11px] text-rose-500 mt-1 block">{formErrors.endDate}</span>
                      )}
                    </div>
                  </div>

                  {/* Masa Simpan di Wallet */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Masa Berlaku Setelah Berhasil Ditukar
                    </label>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="radio"
                          name="validityType"
                          value="duration"
                          checked={formData.validityType === 'duration'}
                          onChange={() => setFormData({ ...formData, validityType: 'duration' })}
                        />
                        <span>Durasi Hari setelah diklaim</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="radio"
                          name="validityType"
                          value="fixed_date"
                          checked={formData.validityType === 'fixed_date'}
                          onChange={() => setFormData({ ...formData, validityType: 'fixed_date' })}
                        />
                        <span>Tanggal tetap tertentu</span>
                      </label>
                    </div>

                    {formData.validityType === 'duration' ? (
                      <div className="mt-2.5 max-w-xs flex items-center gap-2">
                        <input
                          type="number"
                          placeholder="7"
                          value={formData.validityDays || ''}
                          onChange={(e) => setFormData({ ...formData, validityDays: e.target.value })}
                          className="w-24 px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#124734]"
                        />
                        <span className="text-xs text-slate-600 font-medium">
                          Hari sejak penukaran poin
                        </span>
                      </div>
                    ) : (
                      <div className="mt-2.5 max-w-xs">
                        <input
                          type="date"
                          value={formData.fixedExpiryDate || ''}
                          onChange={(e) => setFormData({ ...formData, fixedExpiryDate: e.target.value })}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#124734]"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Bagian 5: Syarat & Ketentuan Penggunaan */}
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#A87950] flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-[#A87950]/15 text-[#A87950] flex items-center justify-center text-[10px]">
                      5
                    </span>
                    Syarat &amp; Ketentuan Penggunaan
                  </h3>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Minimum Transaksi Belanja (Rupiah)
                    </label>
                    <div className="relative max-w-sm">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        Rp
                      </span>
                      <input
                        type="number"
                        step="1000"
                        placeholder="Contoh: 25000"
                        value={formData.minPurchase || ''}
                        onChange={(e) => setFormData({ ...formData, minPurchase: e.target.value })}
                        className="w-full pl-10 pr-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#124734]"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        Dapat Digabung Pembelian Bundle / Combo
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Memperbolehkan voucher dipakai pada transaksi yang berisi menu paket promo.
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.allowBundle}
                        onChange={(e) => setFormData({ ...formData, allowBundle: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#124734]" />
                    </label>
                  </div>
                </div>

                {/* Tombol Simpan */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      resetForm()
                      setActiveTab('list')
                    }}
                    className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-2.5 rounded-xl bg-[#124734] hover:bg-[#092D20] text-white text-xs sm:text-sm font-bold shadow-sm transition-all active:scale-95"
                  >
                    {saving ? 'Menyimpan...' : editingId ? 'Perbarui Voucher' : 'Simpan & Terbitkan'}
                  </button>
                </div>
              </div>
            </form>

            {/* Kolom Kanan: Live Preview Card (35% / 5 Kolom) */}
            <div className="lg:col-span-5 sticky top-6 space-y-4">
              <div className="bg-[#F7F3E9] p-5 sm:p-6 rounded-3xl border border-[#124734]/15 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#124734]/15">
                  <span className="text-[11px] font-bold text-[#A87950] tracking-wider uppercase">
                    Live Preview Customer App
                  </span>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#124734] text-white">
                    Preview
                  </span>
                </div>

                {/* Preview Card */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-md overflow-hidden relative">
                  {/* Perforated edge accent */}
                  <div className="p-4 sm:p-5 space-y-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                          {formData.imageUrl ? (
                            <img src={formData.imageUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[#124734]/60 bg-[#EAF5EE]">
                              <span className="material-symbols-outlined text-[24px]">loyalty</span>
                            </div>
                          )}
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#A87950] block">
                            Justmine Reward
                          </span>
                          <h4 className="font-extrabold text-sm sm:text-base text-slate-900 font-serif leading-tight">
                            {formData.name || 'Nama Voucher Reward'}
                          </h4>
                        </div>
                      </div>

                      {/* Point Badge */}
                      <span className="inline-flex items-center gap-1 font-black text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 text-xs shrink-0">
                        <span className="material-symbols-outlined text-[14px]">stars</span>
                        {formData.pointsRequired || 0} Poin
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 line-clamp-2">
                      {formData.description || 'Deskripsi reward voucher akan tampil di sini saat pelanggan melihat katalog.'}
                    </p>

                    {/* Benefit Highlight Box */}
                    <div className="p-3 rounded-xl bg-[#F7F3E9]/80 border border-[#124734]/10 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Nilai Benefit:</span>
                        <span className="font-black text-[#124734]">
                          {formData.rewardType === 'fixed_discount'
                            ? `Potongan ${rupiah(formData.discountAmount)}`
                            : `Gratis ${formData.freeToppingName || 'Topping'}`}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Syarat Belanja:</span>
                        <span>
                          {formData.minPurchase > 0 ? `Min. ${rupiah(formData.minPurchase)}` : 'Tanpa Minimum'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Masa Berlaku:</span>
                        <span>
                          {formData.validityType === 'duration'
                            ? `${formData.validityDays || 7} Hari setelah klaim`
                            : `Hingga ${formatDateIndo(formData.fixedExpiryDate)}`}
                        </span>
                      </div>
                    </div>

                    {/* Action Button Preview */}
                    <button
                      type="button"
                      disabled
                      className="w-full py-2.5 rounded-xl bg-[#124734] text-white text-xs font-bold text-center opacity-90 cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[16px]">redeem</span>
                      <span>Tukar Sekarang ({formData.pointsRequired || 0} Poin)</span>
                    </button>
                  </div>
                </div>

                {/* Helpful Note */}
                <div className="text-[11px] text-[#124734]/80 space-y-1 leading-relaxed">
                  <p className="font-bold flex items-center gap-1 text-[#124734]">
                    <span className="material-symbols-outlined text-[14px]">verified</span>
                    Aturan Otomatis Sistem:
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>Poin dipotong langsung saat pelanggan mengklik tombol tukar.</li>
                    <li>Voucher langsung masuk ke dompet <em>Voucher Saya</em> di akun pelanggan.</li>
                    <li>Tanpa kode manual — otomatis terpasang saat checkout di POS.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* KONTEN TAB 3: RIWAYAT PENUKARAN POIN                 */}
        {/* ==================================================== */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            {/* Filter Riwayat */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                  search
                </span>
                <input
                  type="text"
                  placeholder="Cari nama pelanggan, ID Cust, atau voucher..."
                  value={redemptionSearch}
                  onChange={(e) => setRedemptionSearch(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#124734]"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={redemptionStatusFilter}
                  onChange={(e) => setRedemptionStatusFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold text-xs text-slate-700 focus:outline-none focus:border-[#124734]"
                >
                  <option value="all">Semua Status Voucher</option>
                  <option value="available">Tersedia (Di Wallet)</option>
                  <option value="used">Sudah Digunakan</option>
                  <option value="expired">Kadaluwarsa</option>
                  <option value="cancelled">Dibatalkan</option>
                </select>

                <button
                  type="button"
                  onClick={exportRedemptionsCSV}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-2xs"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {/* Tabel Riwayat */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-4">Nama Pelanggan</th>
                      <th className="py-3 px-3">ID Cust</th>
                      <th className="py-3 px-3">Voucher Terkait</th>
                      <th className="py-3 px-3">Poin Dipotong</th>
                      <th className="py-3 px-3">Waktu Penukaran</th>
                      <th className="py-3 px-3">Batas Berlaku</th>
                      <th className="py-3 px-4 text-right">Status Voucher</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                    {filteredRedemptions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400">
                          Tidak ada riwayat penukaran yang cocok.
                        </td>
                      </tr>
                    ) : (
                      filteredRedemptions.map((r) => {
                        const statusBadge =
                          r.status === 'used' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              Sudah Pakai
                            </span>
                          ) : r.status === 'available' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              Tersedia
                            </span>
                          ) : r.status === 'expired' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              Kadaluwarsa
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                              Dibatalkan
                            </span>
                          )

                        return (
                          <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-4 font-bold text-slate-900">{r.customerName}</td>
                            <td className="py-3 px-3 font-mono text-[11px] text-slate-500">{r.customerId}</td>
                            <td className="py-3 px-3 font-medium text-slate-800">{r.voucherName}</td>
                            <td className="py-3 px-3 font-extrabold text-rose-700">-{r.pointsDeducted} Poin</td>
                            <td className="py-3 px-3 text-slate-600 text-xs">{formatDateTimeIndo(r.redeemedAt)}</td>
                            <td className="py-3 px-3 text-slate-600 text-xs">{formatDateTimeIndo(r.expiresAt)}</td>
                            <td className="py-3 px-4 text-right">{statusBadge}</td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="py-3 px-4 bg-slate-50/70 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
                <span>Total {filteredRedemptions.length} riwayat transaksi poin tercatat</span>
                <span className="text-[11px] text-slate-400">Poin dikelola otomatis oleh loyalty ledger</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ==================================================== */}
      {/* MODAL: DETAIL VOUCHER & PERFORMA                     */}
      {/* ==================================================== */}
      {selectedVoucher && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                  {selectedVoucher.imageUrl ? (
                    <img src={selectedVoucher.imageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#124734]/50">
                      <span className="material-symbols-outlined text-[24px]">loyalty</span>
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="font-extrabold text-lg text-slate-900 font-serif leading-tight">
                    {selectedVoucher.name}
                  </h3>
                  <p className="text-xs text-slate-500">ID: {selectedVoucher.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVoucher(null)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-700"
              >
                <span className="material-symbols-outlined text-[22px]">close</span>
              </button>
            </div>

            {/* Performance Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Total Ditukar
                </span>
                <span className="text-lg font-black text-slate-800 mt-1 block">
                  {selectedVoucher.redeemedCount || 0}
                </span>
              </div>
              <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 text-center">
                <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                  Total Digunakan
                </span>
                <span className="text-lg font-black text-emerald-900 mt-1 block">
                  {selectedVoucher.usedCount || 0}
                </span>
              </div>
              <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-100 text-center">
                <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">
                  Poin Terbakar
                </span>
                <span className="text-lg font-black text-amber-900 mt-1 block">
                  {((selectedVoucher.redeemedCount || 0) * (selectedVoucher.pointsRequired || 0)).toLocaleString('id-ID')}
                </span>
              </div>
              <div className="p-3 bg-[#EAF5EE] rounded-xl border border-[#124734]/15 text-center">
                <span className="text-[10px] font-bold text-[#124734] uppercase tracking-wider block">
                  Sisa Kuota
                </span>
                <span className="text-lg font-black text-[#124734] mt-1 block">
                  {Math.max(0, (selectedVoucher.quota || 0) - (selectedVoucher.redeemedCount || 0))}
                </span>
              </div>
            </div>

            {/* Progress Kuota */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-700">Distribusi Kuota Voucher</span>
                <span className="text-[#124734]">
                  {selectedVoucher.redeemedCount || 0} / {selectedVoucher.quota || 0} Kuota (
                  {Math.round(((selectedVoucher.redeemedCount || 0) / (selectedVoucher.quota || 1)) * 100)}%)
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-[#124734] rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, ((selectedVoucher.redeemedCount || 0) / (selectedVoucher.quota || 1)) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Detail Aturan */}
            <div className="p-4 bg-[#F7F3E9]/60 rounded-2xl border border-[#124734]/10 space-y-2 text-xs">
              <span className="font-bold text-[#124734] uppercase text-[10px] tracking-wider block">
                Ringkasan Aturan Konfigurasi
              </span>
              <div className="grid grid-cols-2 gap-2 text-slate-700">
                <div>
                  <span className="text-slate-500 block">Tipe Benefit:</span>
                  <span className="font-bold">
                    {selectedVoucher.rewardType === 'fixed_discount'
                      ? `Potongan ${rupiah(selectedVoucher.discountAmount)}`
                      : `Gratis Topping: ${selectedVoucher.freeToppingName}`}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Biaya Penukaran:</span>
                  <span className="font-bold text-amber-800">{selectedVoucher.pointsRequired} Poin</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Masa Berlaku di Wallet:</span>
                  <span className="font-bold">
                    {selectedVoucher.validityType === 'duration'
                      ? `${selectedVoucher.validityDays} Hari setelah klaim`
                      : `Hingga ${formatDateIndo(selectedVoucher.fixedExpiryDate)}`}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Syarat Min. Belanja:</span>
                  <span className="font-bold">
                    {selectedVoucher.minPurchase ? rupiah(selectedVoucher.minPurchase) : 'Tanpa Minimum'}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => handlePromptToggleStatus(selectedVoucher)}
                className={`text-xs font-bold px-4 py-2 rounded-xl border ${
                  selectedVoucher.active
                    ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
                    : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                {selectedVoucher.active ? 'Nonaktifkan Voucher' : 'Aktifkan Voucher'}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedVoucher(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const v = selectedVoucher
                    setSelectedVoucher(null)
                    handleStartEdit(v)
                  }}
                  className="px-4 py-2 text-xs font-bold bg-[#124734] hover:bg-[#092D20] text-white rounded-xl shadow-xs"
                >
                  Edit Konfigurasi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: KONFIRMASI TINDAKAN                           */}
      {/* ==================================================== */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-extrabold text-slate-900">{confirmDialog.title}</h3>
            <p className="text-xs text-slate-600 leading-relaxed">{confirmDialog.message}</p>
            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className={`px-4 py-2 text-xs font-bold text-white rounded-xl shadow-xs ${
                  confirmDialog.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#124734] hover:bg-[#092D20]'
                }`}
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
