import { useEffect, useMemo, useState } from 'react'
import { listenToAllOrders, updateOrderStatus, deleteOrder, markOrderPaid } from '../api/orders.js'
import TopNav from '../components/TopNav.jsx'
import { useAdminAuth } from '../context/AdminAuthContext.jsx'
import { useOrderAlerts, loadSoundPref, saveSoundPref } from '../hooks/useOrderAlerts.js'
import { playChime } from '../utils/chime.js'
import { formatItemOptions, getItemCustomizationDetails } from '../utils/options.js'

const TABS = [
  { key: 'aktif', label: 'Aktif' },
  { key: 'diproses', label: 'Diproses' },
  { key: 'siap', label: 'Siap Diambil' },
  { key: 'selesai', label: 'Selesai' },
  { key: 'semua', label: 'Semua' },
]

const STATUS_LABEL = {
  menunggu: 'Menunggu',
  diproses: 'Diproses',
  siap: 'Siap Diambil',
  selesai: 'Selesai',
  dibatalkan: 'Dibatalkan',
}

const STATUS_COLOR = {
  menunggu: 'bg-amber-100 text-amber-800',
  diproses: 'bg-blue-100 text-blue-800',
  siap: 'bg-emerald-100 text-emerald-800',
  selesai: 'bg-gray-200 text-gray-600',
  dibatalkan: 'bg-red-100 text-red-700',
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
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
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
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('aktif')
  const { isOwner } = useAdminAuth()
  const [soundOn, setSoundOn] = useState(loadSoundPref)

  useEffect(() => {
    const unsub = listenToAllOrders((data) => {
      setOrders(data)
      setLoading(false)
    })
    return unsub
  }, [])

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

  const counts = useMemo(() => {
    const c = { menunggu: 0, diproses: 0, siap: 0, selesai: 0, dibatalkan: 0 }
    orders.forEach((o) => {
      if (c[o.status] !== undefined) c[o.status] += 1
    })
    return { ...c, aktif: c.diproses + c.menunggu }
  }, [orders])

  const parseOrderTime = (o) => {
    if (o.createdAt?.toDate) return o.createdAt.toDate().getTime()
    if (o.createdAt instanceof Date) return o.createdAt.getTime()
    if (typeof o.createdAt === 'number') return o.createdAt
    return o.submittedAt ? new Date(o.submittedAt).getTime() : 0
  }

  const todayStats = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStart = today.getTime()

    let revenue = 0
    let count = 0

    orders.forEach((o) => {
      const t = parseOrderTime(o)
      if (t >= todayStart && o.status !== 'dibatalkan') {
        count += 1
        if (o.paymentStatus === 'dibayar') {
          revenue += (o.total ?? o.subtotal ?? 0)
        }
      }
    })

    return { revenue, count }
  }, [orders])

  const isQueueTab = activeTab === 'aktif' || activeTab === 'diproses'

  const filtered = useMemo(() => {
    let list = []
    if (activeTab === 'semua') list = orders
    else if (activeTab === 'aktif') list = orders.filter((o) => o.status === 'menunggu' || o.status === 'diproses')
    else list = orders.filter((o) => o.status === activeTab)

    // Untuk tab antrian aktif (aktif, menunggu, diproses): Urutkan KRONOLOGIS (FIFO: pesanan lebih lama/masuk duluan di urutan pertama)
    if (isQueueTab) {
      return [...list].sort((a, b) => {
        const tA = parseOrderTime(a) || Date.now()
        const tB = parseOrderTime(b) || Date.now()
        if (tA !== tB) return tA - tB
        return (a.orderCode || '').localeCompare(b.orderCode || '')
      })
    }

    return list
  }, [orders, activeTab, isQueueTab])

  async function advance(order) {
    const next = { diproses: 'siap', siap: 'selesai' }[order.status]
    if (!next) return
    try {
      await updateOrderStatus(order.id, next)
    } catch (err) {
      alert('Gagal mengubah status: ' + err.message)
    }
  }

  async function cancelOrder(order) {
    if (!confirm(`Batalkan pesanan #${order.orderCode}?`)) return
    try {
      await updateOrderStatus(order.id, 'dibatalkan')
    } catch (err) {
      alert('Gagal membatalkan: ' + err.message)
    }
  }

  async function removeOrder(order) {
    if (!confirm(`Hapus permanen pesanan #${order.orderCode}? Tindakan ini tidak bisa dibatalkan.`)) return
    try {
      await deleteOrder(order.id)
    } catch (err) {
      alert('Gagal menghapus: ' + err.message)
    }
  }

  async function markPaid(order) {
    if (!confirm(`Tandai pesanan #${order.orderCode} sudah dibayar (${rupiah(order.total ?? order.subtotal)})?`)) return
    try {
      await markOrderPaid(order.id)
    } catch (err) {
      alert('Gagal menandai dibayar: ' + err.message)
    }
  }

  const nextActionLabel = { diproses: 'Tandai Siap', siap: 'Selesaikan' }

  return (
    <div className="min-h-screen">
      <TopNav />

      {alert && (
        <div className="fixed top-20 right-4 z-50 w-[min(22rem,calc(100vw-2rem))]">
          <div role="status" aria-live="polite" className="flex items-start gap-3 bg-sage-dark text-white rounded-2xl shadow-xl px-4 py-3">
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

      <main className="max-w-6xl mx-auto px-5 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">Dashboard Pesanan</h1>
            <button
              onClick={toggleSound}
              aria-pressed={soundOn}
              className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${soundOn ? 'bg-sage-light text-sage-dark border-transparent' : 'border-border text-ink-muted'
                }`}
            >
              <span className="material-symbols-outlined text-[16px]">{soundOn ? 'volume_up' : 'volume_off'}</span>
              Bunyi {soundOn ? 'aktif' : 'mati'}
            </button>
            {soundOn && (
              <button
                onClick={testSound}
                title="Putar preview suara Cha-Ching"
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-full border border-border text-ink-muted hover:bg-sage-light hover:text-sage-dark transition-colors"
              >
                <span className="material-symbols-outlined text-[15px]">play_circle</span>
                Tes Suara
              </button>
            )}
            {permission === 'default' && (
              <button
                onClick={askPermission}
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full border border-border text-ink-muted hover:bg-sage-light transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">notifications</span>
                Aktifkan notifikasi desktop
              </button>
            )}
            {permission === 'granted' && (
              <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-sage-light text-sage-dark">
                <span className="material-symbols-outlined text-[16px]">notifications_active</span>
                Notifikasi desktop aktif
              </span>
            )}
            {permission === 'denied' && (
              <span
                title="Buka ikon gembok di kolom alamat → Pengaturan situs → Notifikasi → Izinkan"
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full border border-border text-danger"
              >
                <span className="material-symbols-outlined text-[16px]">notifications_off</span>
                Notifikasi diblokir browser
              </span>
            )}
          </div>
        </div>

        {/* Stat Cards Ringkasan */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          {/* Omzet Hari Ini */}
          <div className="bg-surface rounded-2xl p-4 border border-border shadow-xs flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">Omzet Hari Ini</p>
              <p className="text-base sm:text-lg font-extrabold text-sage-dark mt-0.5 truncate">
                {rupiah(todayStats.revenue)}
              </p>
              <p className="text-[10px] text-ink-muted mt-0.5">Pesanan lunas terbayar</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-sage-light text-sage-dark flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">payments</span>
            </div>
          </div>

          {/* Total Pesanan Hari Ini */}
          <div className="bg-surface rounded-2xl p-4 border border-border shadow-xs flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">Pesanan Hari Ini</p>
              <p className="text-base sm:text-lg font-extrabold text-ink mt-0.5">
                {todayStats.count} <span className="text-xs font-medium text-ink-muted">transaksi</span>
              </p>
              <p className="text-[10px] text-ink-muted mt-0.5">Semua meja &amp; kasir</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-surface-muted text-ink flex items-center justify-center shrink-0 border border-border">
              <span className="material-symbols-outlined text-[22px]">receipt_long</span>
            </div>
          </div>

          {/* Sedang Diproses */}
          <div className="bg-surface rounded-2xl p-4 border border-border shadow-xs flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">Sedang Diproses</p>
              <p className="text-base sm:text-lg font-extrabold text-blue-800 mt-0.5">
                {counts.diproses} <span className="text-xs font-medium text-blue-600">antrean</span>
              </p>
              <p className="text-[10px] text-ink-muted mt-0.5">Sedang diracik barista</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">soup_kitchen</span>
            </div>
          </div>

          {/* Siap Diambil */}
          <div className="bg-surface rounded-2xl p-4 border border-border shadow-xs flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Siap Diambil</p>
              <p className="text-base sm:text-lg font-extrabold text-emerald-800 mt-0.5">
                {counts.siap} <span className="text-xs font-medium text-emerald-600">siap saji</span>
              </p>
              <p className="text-[10px] text-ink-muted mt-0.5">Menunggu pickup tamu</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">notifications_active</span>
            </div>
          </div>
        </div>

        {/* Tab Filter Pesanan dengan Badge Counts */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1 scrollbar-none">
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
                    ? 'bg-sage text-white shadow-xs'
                    : 'bg-surface border border-border text-ink-muted hover:bg-sage-light hover:text-ink'
                }`}
              >
                <span>{t.label}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold transition-colors ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : countValue > 0
                      ? 'bg-sage-light text-sage-dark'
                      : 'bg-surface-muted text-ink-muted'
                  }`}
                >
                  {countValue}
                </span>
              </button>
            )
          })}
        </div>

        {loading && <p className="text-ink-muted text-sm">Memuat pesanan...</p>}

        {!loading && filtered.length === 0 && (
          <div className="bg-surface border border-dashed border-border rounded-2xl py-16 text-center text-ink-muted">
            Tidak ada pesanan di kategori ini.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((order, idx) => (
            <div key={order.id} className="bg-surface border border-border rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-sm">#{order.orderCode}</p>
                    {isQueueTab && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sage-light text-sage-dark border border-sage/20">
                        Antrean #{idx + 1}
                      </span>
                    )}
                  </div>
                  {(order.customerName || order.userName) && (
                    <p className="text-xs font-bold text-ink mt-1 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[15px] text-sage">person</span>
                      <span>{order.customerName || order.userName}</span>
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-ink-muted">
                    <span>{formatTime(order.createdAt)}</span>
                    {order.status !== 'selesai' && order.status !== 'dibatalkan' && (
                      <span className="px-1.5 py-0.2 rounded bg-surface-muted text-ink font-semibold">
                        ⏱️ {timeAgo(order.createdAt)}
                      </span>
                    )}
                  </div>
                </div>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${STATUS_COLOR[order.status] || 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABEL[order.status] || order.status}
                </span>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-ink-muted">
                <span className="px-2 py-0.5 rounded-full bg-background border border-border">
                  {order.paymentMethod || '—'}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-background border border-border">
                  {order.userId ? '👤 Member' : '🧑 Tamu'}
                </span>
                {order.tableNumber && (
                  <span className="px-2 py-0.5 rounded-full bg-sage-light text-sage-dark font-bold">
                    Meja {order.tableNumber}
                  </span>
                )}
                {order.paymentStatus === 'belum_dibayar' && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">
                    Belum bayar
                  </span>
                )}
                {order.paymentStatus === 'dibayar' && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                    Dibayar
                  </span>
                )}
              </div>

              <div className="border-t border-border pt-2 flex flex-col gap-2">
                {(order.items || []).map((it, idx) => {
                  const badges = getItemCustomizationDetails(it)
                  return (
                    <div key={idx} className="text-sm">
                      <div className="flex justify-between items-baseline">
                        <span className="font-semibold text-ink">
                          {it.qty}× {it.name}
                        </span>
                        <span className="text-ink-muted text-xs font-medium">{rupiah(it.price * it.qty)}</span>
                      </div>

                      {it.isBundle && Array.isArray(it.bundleSlots) ? (
                        <div className="mt-1.5 pl-3 space-y-1.5">
                          {it.bundleSlots.map((slot, sIdx) => (
                            <div key={sIdx} className="text-xs bg-sage-light/40 rounded-lg p-2 border border-sage/20 text-slate-800">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-sage-dark text-[11px]">
                                  {slot.slotTitle || `Cup ${sIdx + 1}`}: {slot.drinkName}
                                </span>
                                {slot.topping && (
                                  <span className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-800 font-semibold flex items-center gap-0.5">
                                    <span className="material-symbols-outlined text-[11px] leading-none text-emerald-600">add_circle</span>
                                    {slot.toppingLabel}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-600 flex flex-wrap gap-1.5 mt-1 font-medium items-center">
                                {slot.iceLabel && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200/80 text-[10px]">
                                    <span className="material-symbols-outlined text-[11px] leading-none text-sky-600">ac_unit</span>
                                    {slot.iceLabel}
                                  </span>
                                )}
                                {slot.sugarLabel && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200/80 text-[10px]">
                                    <span className="material-symbols-outlined text-[11px] leading-none text-amber-600">water_drop</span>
                                    {slot.sugarLabel}
                                  </span>
                                )}
                                {slot.note && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-300 italic text-[10px]">
                                    <span className="material-symbols-outlined text-[11px] leading-none text-amber-700">edit_note</span>
                                    "{slot.note}"
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        badges.length > 0 && (
                          <div className="mt-1 pl-3 flex flex-wrap gap-1.5 items-center">
                            {badges.map((b, bIdx) => (
                              <span
                                key={bIdx}
                                className={`inline-flex items-center gap-1 text-[11px] leading-tight px-2 py-0.5 rounded-md border ${b.bgClass}`}
                              >
                                {b.icon && (
                                  <span className={`material-symbols-outlined text-[13px] leading-none shrink-0 ${b.iconColor}`}>
                                    {b.icon}
                                  </span>
                                )}
                                <span>{b.label}</span>
                              </span>
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  )
                })}
              </div>


              <div className="border-t border-border pt-2 flex justify-between font-bold text-sm">
                <span>Total</span>
                <span className="text-sage-dark">{rupiah(order.total ?? order.subtotal)}</span>
              </div>

              {order.paymentMethod === 'Bayar di Kasir' && order.paymentStatus === 'belum_dibayar' && order.status !== 'dibatalkan' && (
                <button
                  onClick={() => markPaid(order)}
                  className="w-full flex items-center justify-center gap-1.5 border border-sage bg-sage-light/40 text-sage-dark text-xs font-bold py-2.5 rounded-xl hover:bg-sage-light active:scale-[0.99] transition-all"
                >
                  <span className="material-symbols-outlined text-[16px]">payments</span>
                  <span>Tandai Sudah Dibayar</span>
                </button>
              )}

              {(order.status === 'diproses' || order.status === 'siap') && (
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => advance(order)}
                    className={`flex-1 flex items-center justify-center gap-1.5 text-white text-xs sm:text-sm font-bold py-2.5 rounded-xl active:scale-[0.99] shadow-xs transition-all ${
                      order.status === 'diproses'
                        ? 'bg-sage hover:bg-sage-dark'
                        : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {order.status === 'diproses' ? 'notifications_active' : 'check_circle'}
                    </span>
                    <span>{nextActionLabel[order.status]}</span>
                  </button>
                  {order.status !== 'siap' && (
                    <button
                      onClick={() => cancelOrder(order)}
                      className="px-3 py-2.5 rounded-xl border border-border text-danger hover:text-white text-sm font-bold hover:bg-danger transition-colors"
                      title="Batalkan pesanan"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}

              {isOwner && (order.status === 'selesai' || order.status === 'dibatalkan') && (
                <button
                  onClick={() => removeOrder(order)}
                  className="text-[11px] text-ink-muted hover:text-danger self-start mt-0.5"
                >
                  Hapus data pesanan ini
                </button>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}