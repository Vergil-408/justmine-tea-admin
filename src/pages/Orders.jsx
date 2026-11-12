import { useEffect, useMemo, useState } from 'react'
import { listenToAllOrders, updateOrderStatus, deleteOrder, markOrderPaid, updateOrderDetails } from '../api/orders.js'
import { listenToMenuItemsAdmin } from '../api/menu.js'
import TopNav from '../components/TopNav.jsx'
import { useAdminAuth } from '../context/AdminAuthContext.jsx'
import { useOrderAlerts, loadSoundPref, saveSoundPref } from '../hooks/useOrderAlerts.js'
import { playChime } from '../utils/chime.js'
import { getDrinkSpecifications } from '../utils/options.js'

const TABS = [
  { key: 'aktif', label: 'Aktif' },
  { key: 'diproses', label: 'Diproses' },
  { key: 'siap', label: 'Siap Diambil' },
  { key: 'selesai', label: 'Selesai' },
  { key: 'semua', label: 'Semua' },
]

const STATUS_CONFIG = {
  menunggu: {
    label: 'Aktif',
    dotClass: 'bg-emerald-500',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    borderClass: 'border-emerald-300',
  },
  diproses: {
    label: 'Diproses',
    dotClass: 'bg-blue-500',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
    borderClass: 'border-blue-300',
  },
  siap: {
    label: 'Siap Diambil',
    dotClass: 'bg-amber-500',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    borderClass: 'border-amber-300',
  },
  selesai: {
    label: 'Selesai',
    dotClass: 'bg-gray-400',
    badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
    borderClass: 'border-gray-200',
  },
  dibatalkan: {
    label: 'Dibatalkan',
    dotClass: 'bg-red-500',
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
    borderClass: 'border-red-200',
  },
}

function rupiah(n) {
  return `Rp${Number(n || 0).toLocaleString('id-ID')}`
}

function toDate(ts) {
  if (!ts) return null
  if (typeof ts.toDate === 'function') return ts.toDate()
  return new Date(ts)
}

function formatTime(ts) {
  const d = toDate(ts)
  if (!d) return '—'
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

function formatFullTime(ts) {
  const d = toDate(ts)
  if (!d) return '—'
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function timeAgo(ts) {
  const d = toDate(ts)
  if (!d) return ''
  const diffMins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (diffMins < 1) return 'Baru saja'
  if (diffMins < 60) return `${diffMins} mnt lalu`
  const diffHours = Math.floor(diffMins / 60)
  return `${diffHours} jam lalu`
}

export default function Orders() {
  const [orders, setOrders] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('aktif')
  const [dateFilter, setDateFilter] = useState('today') // 'today', 'all'
  const { isOwner } = useAdminAuth()
  const [soundOn, setSoundOn] = useState(loadSoundPref)

  // State Modal
  const [detailOrder, setDetailOrder] = useState(null)
  const [editOrder, setEditOrder] = useState(null)

  useEffect(() => {
    const unsubOrders = listenToAllOrders((data) => {
      setOrders(data)
      setLoading(false)
    })
    const unsubMenu = listenToMenuItemsAdmin((items) => {
      setMenuItems(items)
    })
    return () => {
      unsubOrders()
      unsubMenu()
    }
  }, [])

  // Map gambar menu dari menuItems (by id dan by nama)
  const menuImageMap = useMemo(() => {
    const map = new Map()
    menuItems.forEach((m) => {
      if (m.id && m.image) map.set(m.id, m.image)
      if (m.name && m.image) map.set(m.name.toLowerCase().trim(), m.image)
    })
    return map
  }, [menuItems])

  const getItemImage = (it) => {
    if (it.image) return it.image
    if (it.imageUrl) return it.imageUrl
    if (it.id && menuImageMap.has(it.id)) return menuImageMap.get(it.id)
    if (it.menuId && menuImageMap.has(it.menuId)) return menuImageMap.get(it.menuId)
    if (it.name && menuImageMap.has(it.name.toLowerCase().trim())) {
      return menuImageMap.get(it.name.toLowerCase().trim())
    }
    return ''
  }

  const { alert, dismiss, permission, askPermission } = useOrderAlerts(orders, !loading, soundOn)

  function toggleSound() {
    const next = !soundOn
    setSoundOn(next)
    saveSoundPref(next)
    if (next) {
      try { playChime(2) } catch {}
    }
  }

  function testSound() {
    try { playChime(2) } catch {}
  }

  const parseOrderTime = (o) => {
    if (o.createdAt?.toDate) return o.createdAt.toDate().getTime()
    if (o.createdAt instanceof Date) return o.createdAt.getTime()
    if (typeof o.createdAt === 'number') return o.createdAt
    return o.submittedAt ? new Date(o.submittedAt).getTime() : 0
  }

  // Statistik Ringkasan Atas
  const stats = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStart = today.getTime()

    let revenueToday = 0
    let countToday = 0
    let activeQueueCount = 0

    orders.forEach((o) => {
      const t = parseOrderTime(o)
      const isToday = t >= todayStart

      if (o.status === 'menunggu' || o.status === 'diproses') {
        activeQueueCount += 1
      }

      if (isToday && o.status !== 'dibatalkan') {
        countToday += 1
        if (o.paymentStatus === 'dibayar') {
          revenueToday += (o.total ?? o.subtotal ?? 0)
        }
      }
    })

    const avgTransaction = countToday > 0 ? Math.round(revenueToday / countToday) : 0

    return {
      revenueToday,
      countToday,
      avgTransaction,
      activeQueueCount,
    }
  }, [orders])

  // Hitungan tab
  const counts = useMemo(() => {
    const c = { menunggu: 0, diproses: 0, siap: 0, selesai: 0, dibatalkan: 0 }
    orders.forEach((o) => {
      if (c[o.status] !== undefined) c[o.status] += 1
    })
    return { ...c, aktif: c.diproses + c.menunggu }
  }, [orders])

  const isQueueTab = activeTab === 'aktif' || activeTab === 'diproses'

  // Filter daftar pesanan
  const filtered = useMemo(() => {
    let list = []
    if (activeTab === 'semua') list = orders
    else if (activeTab === 'aktif') list = orders.filter((o) => o.status === 'menunggu' || o.status === 'diproses')
    else list = orders.filter((o) => o.status === activeTab)

    // Filter tanggal jika dipilih hari ini
    if (dateFilter === 'today') {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayStart = today.getTime()
      list = list.filter((o) => {
        const t = parseOrderTime(o)
        // Jika antrean masih aktif, tetap tampilkan meski dari hari sebelumnya
        if (o.status === 'menunggu' || o.status === 'diproses') return true
        return t >= todayStart
      })
    }

    // Untuk tab antrian aktif: Urutkan KRONOLOGIS (FIFO: pesanan lebih lama/masuk duluan di urutan pertama)
    if (isQueueTab) {
      return [...list].sort((a, b) => {
        const tA = parseOrderTime(a) || Date.now()
        const tB = parseOrderTime(b) || Date.now()
        if (tA !== tB) return tA - tB
        return (a.orderCode || '').localeCompare(b.orderCode || '')
      })
    }

    // Untuk tab lainnya: Urutkan terbalik (pesanan terbaru di atas)
    return [...list].sort((a, b) => {
      const tA = parseOrderTime(a) || 0
      const tB = parseOrderTime(b) || 0
      return tB - tA
    })
  }, [orders, activeTab, isQueueTab, dateFilter])

  // Aksi status
  async function advanceToReady(order) {
    try {
      await updateOrderStatus(order.id, 'siap')
    } catch (err) {
      window.alert('Gagal menandai siap: ' + err.message)
    }
  }

  async function advanceToComplete(order) {
    try {
      await updateOrderStatus(order.id, 'selesai')
    } catch (err) {
      window.alert('Gagal menyelesaikan pesanan: ' + err.message)
    }
  }

  async function cancelOrder(order) {
    const reason = window.prompt(`Masukkan alasan pembatalan pesanan #${order.orderCode}:`, 'Dibatalkan oleh kasir/pelanggan')
    if (reason === null) return
    try {
      await updateOrderDetails(order.id, {
        status: 'dibatalkan',
        cancelledReason: reason.trim() || 'Dibatalkan oleh kasir',
      })
    } catch (err) {
      window.alert('Gagal membatalkan: ' + err.message)
    }
  }

  async function removeOrder(order) {
    if (!window.confirm(`Hapus permanen pesanan #${order.orderCode}? Tindakan ini tidak bisa dibatalkan.`)) return
    try {
      await deleteOrder(order.id)
    } catch (err) {
      window.alert('Gagal menghapus: ' + err.message)
    }
  }

  async function markPaid(order) {
    if (!window.confirm(`Tandai pesanan #${order.orderCode} sudah dibayar (${rupiah(order.total ?? order.subtotal)})?`)) return
    try {
      await markOrderPaid(order.id)
    } catch (err) {
      window.alert('Gagal menandai dibayar: ' + err.message)
    }
  }

  return (
    <div className="min-h-screen bg-white text-slate-800">
      <TopNav />

      {/* Floating Notification Alert */}
      {alert && (
        <div className="fixed top-20 right-4 z-50 w-[min(22rem,calc(100vw-2rem))]">
          <div role="status" aria-live="polite" className="flex items-start gap-3 bg-[#124734] text-white rounded-2xl shadow-xl px-4 py-3">
            <span className="material-symbols-outlined text-[22px] mt-0.5 shrink-0">
              {alert.type === 'paid' ? 'paid' : 'notifications_active'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{alert.title}</p>
              <p className="text-xs opacity-90 mt-0.5">{alert.body}</p>
              {alert.extra > 0 && <p className="text-[11px] opacity-80 mt-1">+{alert.extra} kejadian lain</p>}
            </div>
            <button onClick={dismiss} aria-label="Tutup" className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center hover:bg-white/15">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Header Dashboard & Filter Waktu */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Dashboard Pesanan</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Pantau pesanan, kelola operasional outlet dengan mudah.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Filter Hari Ini / Semua */}
            <div className="inline-flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1 text-xs font-semibold">
              <button
                onClick={() => setDateFilter('today')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  dateFilter === 'today' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                Hari Ini
              </button>
              <button
                onClick={() => setDateFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  dateFilter === 'all' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">history</span>
                Semua
              </button>
            </div>

            {/* Kontrol Audio Alert */}
            <button
              onClick={toggleSound}
              aria-pressed={soundOn}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition-colors ${
                soundOn ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{soundOn ? 'volume_up' : 'volume_off'}</span>
              <span>Bunyi {soundOn ? 'Aktif' : 'Mati'}</span>
            </button>

            {soundOn && (
              <button
                onClick={testSound}
                title="Putar preview suara Cha-Ching"
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-2 rounded-xl border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-900 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">play_circle</span>
                <span>Tes</span>
              </button>
            )}

            {permission === 'default' && (
              <button
                onClick={askPermission}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">notifications</span>
                <span>Aktifkan Notifikasi</span>
              </button>
            )}
          </div>
        </div>

        {/* 4 Metric Cards Sesuai Mockup */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          {/* 1. Omzet Hari Ini */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">Omzet Hari Ini</p>
              <p className="text-lg sm:text-xl font-extrabold text-slate-900 mt-1 truncate">
                {rupiah(stats.revenueToday)}
              </p>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 mt-1">
                <span className="material-symbols-outlined text-[14px]">trending_up</span>
                <span>+12% vs kemarin</span>
              </div>
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">payments</span>
            </div>
          </div>

          {/* 2. Total Transaksi */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">Total Transaksi</p>
              <p className="text-lg sm:text-xl font-extrabold text-slate-900 mt-1">
                {stats.countToday} <span className="text-xs font-normal text-slate-400">order</span>
              </p>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 mt-1">
                <span className="material-symbols-outlined text-[14px]">trending_up</span>
                <span>+8%</span>
              </div>
            </div>
            <div className="w-11 h-11 rounded-xl bg-slate-50 text-slate-700 border border-slate-200/80 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">shopping_cart</span>
            </div>
          </div>

          {/* 3. Rata-rata per Transaksi */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">Rata-rata per Transaksi</p>
              <p className="text-lg sm:text-xl font-extrabold text-slate-900 mt-1 truncate">
                {rupiah(stats.avgTransaction)}
              </p>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 mt-1">
                <span className="material-symbols-outlined text-[14px]">trending_up</span>
                <span>+6%</span>
              </div>
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">local_cafe</span>
            </div>
          </div>

          {/* 4. Antrean Aktif */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">Antrean Aktif</p>
              <p className="text-lg sm:text-xl font-extrabold text-slate-900 mt-1">
                {stats.activeQueueCount} <span className="text-xs font-normal text-slate-400">pesanan</span>
              </p>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 mt-1">
                <span className="material-symbols-outlined text-[14px]">soup_kitchen</span>
                <span>Perlu dipersiapkan</span>
              </div>
            </div>
            <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">groups</span>
            </div>
          </div>
        </div>

        {/* Tab Filter Pesanan */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1 scrollbar-none">
          {TABS.map((t) => {
            const countValue =
              t.key === 'semua'
                ? orders.length
                : t.key === 'aktif'
                ? counts.aktif
                : counts[t.key] ?? 0

            const isActive = activeTab === t.key

            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`shrink-0 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                  isActive
                    ? 'bg-[#124734] text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span>{t.label}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold transition-colors ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : countValue > 0
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {countValue}
                </span>
              </button>
            )
          })}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="py-20 text-center text-slate-400">
            <span className="material-symbols-outlined text-4xl animate-spin">progress_activity</span>
            <p className="text-sm mt-2 font-medium">Memuat pesanan...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && filtered.length === 0 && (
          <div className="bg-white border border-dashed border-slate-200 rounded-3xl py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 text-slate-300 mx-auto flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-[36px]">receipt_long</span>
            </div>
            <p className="text-base font-bold text-slate-700">Tidak ada pesanan</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              {activeTab === 'aktif'
                ? 'Semua antrean aktif sudah selesai disajikan.'
                : `Belum ada pesanan pada kategori "${TABS.find((t) => t.key === activeTab)?.label}".`}
            </p>
          </div>
        )}

        {/* Order Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((order, idx) => {
            const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.selesai
            const itemCount = (order.items || []).reduce((sum, it) => sum + (it.qty || 1), 0)
            const queueNumber = isQueueTab ? idx + 1 : null
            const hasMultipleItems = (order.items || []).length > 1

            return (
              <div
                key={order.id}
                className={`bg-white border rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between ${
                  order.status === 'menunggu' || order.status === 'diproses'
                    ? 'border-emerald-300/80 ring-1 ring-emerald-500/10'
                    : 'border-slate-200/80'
                }`}
              >
                <div>
                  {/* Row 1: Status Dot & Badge + Waktu & Jumlah Item */}
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${statusConfig.badgeClass}`}>
                      <span className={`w-2 h-2 rounded-full ${statusConfig.dotClass}`}></span>
                      <span>{statusConfig.label}</span>
                    </span>

                    <div className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                      <span>{formatTime(order.createdAt)}</span>
                      <span>•</span>
                      <span>{itemCount} item</span>
                    </div>
                  </div>

                  {/* Row 2: Order ID, Meja, Antrean, dan Nama Pemesan */}
                  <div className="pt-3 pb-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-slate-900 tracking-tight">
                          #{order.orderCode || order.id?.slice(-4)}
                        </span>
                        {queueNumber !== null && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                            Antrean #{queueNumber}
                          </span>
                        )}
                      </div>

                      {order.tableNumber ? (
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px]">table_restaurant</span>
                          <span>Meja {order.tableNumber}</span>
                        </span>
                      ) : (
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          Take Away / Kasir
                        </span>
                      )}
                    </div>

                    {(order.customerName || order.userName) && (
                      <p className="text-xs font-bold text-slate-700 mt-1 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[15px] text-[#124734]">person</span>
                        <span>{order.customerName || order.userName}</span>
                      </p>
                    )}
                  </div>

                  {/* Row 3: Daftar Minuman & Detail Customization */}
                  <div className="border-t border-slate-100 pt-3 space-y-4">
                    {(order.items || []).map((it, itIdx) => {
                      const image = getItemImage(it)
                      const specs = getDrinkSpecifications(it)
                      const itemTotal = (it.price || 0) * (it.qty || 1)

                      return (
                        <div
                          key={itIdx}
                          className={`${itIdx > 0 ? 'pt-3 border-t border-dashed border-slate-200' : ''}`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Thumbnail Gambar Minuman */}
                            <div className="w-14 h-14 rounded-xl bg-slate-50 border border-slate-200/80 overflow-hidden shrink-0 flex items-center justify-center">
                              {image ? (
                                <img
                                  src={image}
                                  alt={it.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none'
                                    e.currentTarget.nextElementSibling?.classList.remove('hidden')
                                  }}
                                />
                              ) : null}
                              <span className={`material-symbols-outlined text-emerald-700 text-2xl ${image ? 'hidden' : ''}`}>
                                local_cafe
                              </span>
                            </div>

                            {/* Info Minuman & Detail Spesifikasi Barista */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <h4 className="text-sm font-bold text-slate-900 leading-snug">
                                  {it.qty > 1 && <span className="text-[#124734] font-black">{it.qty}× </span>}
                                  {it.name}
                                </h4>
                                <span className="text-xs font-bold text-slate-900 shrink-0">
                                  {rupiah(itemTotal)}
                                </span>
                              </div>

                              {/* Detail Customization Spesifikasi Barista */}
                              {it.isBundle && Array.isArray(it.bundleSlots) ? (
                                <div className="mt-2 space-y-2">
                                  {specs.map((slotData, sIdx) => (
                                    <div key={sIdx} className="bg-slate-50 rounded-lg p-2 border border-slate-200/80 text-xs">
                                      <p className="font-bold text-[#124734] text-[11px] mb-1">
                                        {slotData.slotTitle}: {slotData.drinkName}
                                      </p>
                                      <div className="space-y-0.5 text-slate-600">
                                        {(slotData.specs || []).map((sp, spIdx) => (
                                          <div key={spIdx} className="flex items-center gap-1.5 text-[11px]">
                                            <span className="material-symbols-outlined text-[13px] text-slate-500">
                                              {sp.icon}
                                            </span>
                                            <span className="font-semibold text-slate-700">{sp.label} :</span>
                                            <span className="text-slate-900">{sp.value}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                specs.length > 0 && (
                                  <div className="mt-1.5 space-y-0.5">
                                    {specs.map((sp, spIdx) => (
                                      <div key={spIdx} className="flex items-center gap-1.5 text-xs">
                                        <span className="material-symbols-outlined text-[14px] text-slate-500">
                                          {sp.icon}
                                        </span>
                                        <span className="font-medium text-slate-500">{sp.label} :</span>
                                        <span className="font-semibold text-slate-900">{sp.value}</span>
                                      </div>
                                    ))}
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Footer Kartu: Total, Status Pembayaran & Tombol Aksi */}
                <div className="mt-4 pt-3 border-t border-slate-100">
                  {/* Total & Info Pembayaran */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500">Total:</span>
                      <span className="text-sm font-extrabold text-[#124734]">
                        {rupiah(order.total ?? order.subtotal)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        {order.paymentMethod || 'Kasir'}
                      </span>
                      {order.paymentStatus === 'dibayar' ? (
                        <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                          Dibayar
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                          Belum bayar
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Tombol Aksi Sesuai Status */}
                  <div className="flex items-center gap-2">
                    {/* Tombol Detail */}
                    <button
                      onClick={() => setDetailOrder(order)}
                      className="flex-1 flex items-center justify-center gap-1 text-xs font-bold py-2 rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 active:scale-[0.98] transition-all"
                    >
                      <span className="material-symbols-outlined text-[16px]">visibility</span>
                      <span>Detail</span>
                    </button>

                    {/* Tombol Ubah (jika pesanan belum selesai/dibatalkan) */}
                    {order.status !== 'selesai' && order.status !== 'dibatalkan' && (
                      <button
                        onClick={() => setEditOrder(order)}
                        className="flex-1 flex items-center justify-center gap-1 text-xs font-bold py-2 rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 active:scale-[0.98] transition-all"
                      >
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                        <span>Ubah</span>
                      </button>
                    )}

                    {/* Tombol Aksi Status Utama */}
                    {(order.status === 'menunggu' || order.status === 'diproses') && (
                      <button
                        onClick={() => advanceToReady(order)}
                        className="flex-1 flex items-center justify-center gap-1 text-xs font-bold py-2 rounded-xl bg-[#124734] hover:bg-[#0c3124] text-white active:scale-[0.98] shadow-xs transition-all"
                      >
                        <span className="material-symbols-outlined text-[16px]">check</span>
                        <span>Siap</span>
                      </button>
                    )}

                    {order.status === 'siap' && (
                      <button
                        onClick={() => advanceToComplete(order)}
                        className="flex-1 flex items-center justify-center gap-1 text-xs font-bold py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white active:scale-[0.98] shadow-xs transition-all"
                      >
                        <span className="material-symbols-outlined text-[16px]">shopping_bag</span>
                        <span>Ambil</span>
                      </button>
                    )}

                    {/* Opsi Hapus untuk Owner jika sudah Selesai/Dibatalkan */}
                    {isOwner && (order.status === 'selesai' || order.status === 'dibatalkan') && (
                      <button
                        onClick={() => removeOrder(order)}
                        className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
                        title="Hapus permanen pesanan ini"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </main>

      {/* Modal Detail Pesanan */}
      {detailOrder && (
        <OrderDetailModal
          order={detailOrder}
          getItemImage={getItemImage}
          onClose={() => setDetailOrder(null)}
          onMarkPaid={() => {
            markPaid(detailOrder)
            setDetailOrder(null)
          }}
          onAdvanceReady={() => {
            advanceToReady(detailOrder)
            setDetailOrder(null)
          }}
          onAdvanceComplete={() => {
            advanceToComplete(detailOrder)
            setDetailOrder(null)
          }}
          onCancel={() => {
            cancelOrder(detailOrder)
            setDetailOrder(null)
          }}
        />
      )}

      {/* Modal Ubah Pesanan */}
      {editOrder && (
        <OrderEditModal
          order={editOrder}
          onClose={() => setEditOrder(null)}
          onSaved={() => setEditOrder(null)}
        />
      )}
    </div>
  )
}

// -------------------------------------------------------------
// Komponen Modal Detail Pesanan
// -------------------------------------------------------------
function OrderDetailModal({
  order,
  getItemImage,
  onClose,
  onMarkPaid,
  onAdvanceReady,
  onAdvanceComplete,
  onCancel,
}) {
  const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.selesai

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
        {/* Header Modal */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-black text-slate-900 tracking-tight">
                Pesanan #{order.orderCode || order.id?.slice(-4)}
              </h3>
              <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full border ${statusConfig.badgeClass}`}>
                <span className={`w-2 h-2 rounded-full ${statusConfig.dotClass}`}></span>
                <span>{statusConfig.label}</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{formatFullTime(order.createdAt)}</p>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Konten Scrollable */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          {/* Identitas Pesanan */}
          <div className="grid grid-cols-2 gap-3 bg-slate-50 rounded-2xl p-4 border border-slate-100 text-xs">
            <div>
              <p className="text-slate-400 font-medium">Pelanggan</p>
              <p className="font-bold text-slate-900 text-sm mt-0.5">
                {order.customerName || order.userName || 'Tamu Outlet'}
              </p>
            </div>
            <div>
              <p className="text-slate-400 font-medium">Nomor Meja / Lokasi</p>
              <p className="font-bold text-slate-900 text-sm mt-0.5">
                {order.tableNumber ? `Meja ${order.tableNumber}` : 'Take Away / Kasir'}
              </p>
            </div>
            <div>
              <p className="text-slate-400 font-medium">Metode Pembayaran</p>
              <p className="font-bold text-slate-900 mt-0.5">{order.paymentMethod || 'Kasir'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-medium">Status Pembayaran</p>
              <p className="font-bold mt-0.5">
                {order.paymentStatus === 'dibayar' ? (
                  <span className="text-emerald-700">Sudah Lunas</span>
                ) : (
                  <span className="text-amber-700">Belum Dibayar</span>
                )}
              </p>
            </div>
          </div>

          {/* Catatan Keseluruhan Pesanan */}
          {order.note && (
            <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 text-xs text-amber-900">
              <span className="font-bold">Catatan Pesanan: </span>
              <span>"{order.note}"</span>
            </div>
          )}

          {/* Daftar Produk */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Daftar Pesanan ({order.items?.length || 0} Menu)
            </h4>
            <div className="space-y-3">
              {(order.items || []).map((it, idx) => {
                const image = getItemImage(it)
                const specs = getDrinkSpecifications(it)
                const itemTotal = (it.price || 0) * (it.qty || 1)

                return (
                  <div key={idx} className="border border-slate-100 rounded-2xl p-3 bg-white flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200/80 overflow-hidden shrink-0 flex items-center justify-center">
                      {image ? (
                        <img src={image} alt={it.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-emerald-700 text-xl">local_cafe</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-bold text-slate-900">
                          {it.qty > 1 && <span className="text-[#124734] font-black">{it.qty}× </span>}
                          {it.name}
                        </p>
                        <span className="text-xs font-bold text-slate-900">{rupiah(itemTotal)}</span>
                      </div>

                      {/* Spesifikasi Barista */}
                      {it.isBundle && Array.isArray(it.bundleSlots) ? (
                        <div className="mt-2 space-y-1.5">
                          {specs.map((slotData, sIdx) => (
                            <div key={sIdx} className="bg-slate-50 rounded-lg p-2 border border-slate-200/80 text-xs">
                              <p className="font-bold text-[#124734] text-[11px] mb-1">
                                {slotData.slotTitle}: {slotData.drinkName}
                              </p>
                              <div className="space-y-0.5 text-slate-600">
                                {(slotData.specs || []).map((sp, spIdx) => (
                                  <div key={spIdx} className="flex items-center gap-1 text-[11px]">
                                    <span className="font-semibold text-slate-700">{sp.label}:</span>
                                    <span>{sp.value}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        specs.length > 0 && (
                          <div className="mt-1 space-y-0.5 text-xs">
                            {specs.map((sp, spIdx) => (
                              <div key={spIdx} className="flex items-center gap-1.5 text-[11px]">
                                <span className="material-symbols-outlined text-[13px] text-slate-500">{sp.icon}</span>
                                <span className="font-semibold text-slate-600">{sp.label}:</span>
                                <span className="text-slate-900 font-medium">{sp.value}</span>
                              </div>
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Ringkasan Total */}
          <div className="border-t border-slate-100 pt-3 flex justify-between items-center text-sm">
            <span className="font-bold text-slate-700">Total Pembayaran</span>
            <span className="text-lg font-black text-[#124734]">{rupiah(order.total ?? order.subtotal)}</span>
          </div>
        </div>

        {/* Footer Tombol Aksi Modal */}
        <div className="pt-4 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
          {order.paymentMethod === 'Bayar di Kasir' && order.paymentStatus === 'belum_dibayar' && (
            <button
              onClick={onMarkPaid}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">payments</span>
              <span>Tandai Sudah Bayar</span>
            </button>
          )}

          {(order.status === 'menunggu' || order.status === 'diproses') && (
            <button
              onClick={onAdvanceReady}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[#124734] hover:bg-[#0c3124] text-white transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">check</span>
              <span>Tandai Siap Diambil</span>
            </button>
          )}

          {order.status === 'siap' && (
            <button
              onClick={onAdvanceComplete}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">shopping_bag</span>
              <span>Selesaikan Pesanan</span>
            </button>
          )}

          {order.status !== 'selesai' && order.status !== 'dibatalkan' && (
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-xl text-xs font-bold border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
            >
              Batalkan
            </button>
          )}

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  )
}

// -------------------------------------------------------------
// Komponen Modal Ubah Pesanan
// -------------------------------------------------------------
function OrderEditModal({ order, onClose, onSaved }) {
  const [tableNumber, setTableNumber] = useState(order.tableNumber || '')
  const [customerName, setCustomerName] = useState(order.customerName || order.userName || '')
  const [note, setNote] = useState(order.note || '')
  const [status, setStatus] = useState(order.status || 'menunggu')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await updateOrderDetails(order.id, {
        tableNumber: tableNumber.trim(),
        customerName: customerName.trim(),
        note: note.trim(),
        status,
      })
      onSaved()
    } catch (err) {
      window.alert('Gagal menyimpan perubahan: ' + err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-black text-slate-900">Ubah Pesanan #{order.orderCode}</h3>
            <p className="text-xs text-slate-400 mt-0.5">Perbarui rincian meja, nama, catatan, atau status.</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="py-4 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Nomor Meja</label>
            <input
              type="text"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              placeholder="Contoh: 1, 8, atau kosongkan untuk Takeaway"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#124734]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Nama Pemesan</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nama pelanggan di struk"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#124734]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Status Pesanan</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#124734] bg-white"
            >
              <option value="menunggu">Menunggu / Aktif</option>
              <option value="diproses">Diproses</option>
              <option value="siap">Siap Diambil</option>
              <option value="selesai">Selesai</option>
              <option value="dibatalkan">Dibatalkan</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Catatan Tambahan</label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Catatan khusus pelanggan atau kasir..."
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#124734]"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-[#124734] hover:bg-[#0c3124] text-white transition-colors flex items-center gap-1.5"
            >
              {saving && <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>}
              <span>Simpan Perubahan</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
