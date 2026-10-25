import { useEffect, useMemo, useState } from 'react'
import { listenToAllOrders, updateOrderStatus, deleteOrder, markOrderPaid } from '../api/orders.js'
import TopNav from '../components/TopNav.jsx'
import { useAdminAuth } from '../context/AdminAuthContext.jsx'
import { useOrderAlerts, loadSoundPref, saveSoundPref } from '../hooks/useOrderAlerts.js'
import { playChime } from '../utils/chime.js'
import { formatItemOptions } from '../utils/options.js'

const TABS = [
  { key: 'aktif', label: 'Aktif' },
  { key: 'menunggu', label: 'Menunggu' },
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
    return c
  }, [orders])

  const parseOrderTime = (o) => {
    if (o.createdAt?.toDate) return o.createdAt.toDate().getTime()
    if (o.createdAt instanceof Date) return o.createdAt.getTime()
    if (typeof o.createdAt === 'number') return o.createdAt
    return o.submittedAt ? new Date(o.submittedAt).getTime() : 0
  }

  const isQueueTab = activeTab === 'aktif' || activeTab === 'menunggu' || activeTab === 'diproses'

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
    const next = { menunggu: 'diproses', diproses: 'siap', siap: 'selesai' }[order.status]
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

  const nextActionLabel = { menunggu: 'Mulai Proses', diproses: 'Tandai Siap', siap: 'Selesaikan' }

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
          <div className="flex gap-2 text-xs font-semibold">
            <span className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-800">⏳ {counts.menunggu} Menunggu</span>
            <span className="px-3 py-1.5 rounded-full bg-blue-100 text-blue-800">🍵 {counts.diproses} Diproses</span>
            <span className="px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-800">🔔 {counts.siap} Siap</span>
          </div>
        </div>

        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${activeTab === t.key ? 'bg-sage text-white' : 'bg-surface border border-border text-ink-muted hover:bg-sage-light'
                }`}
            >
              {t.label}
            </button>
          ))}
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
                  <p className="text-[11px] text-ink-muted mt-0.5">{formatTime(order.createdAt)}</p>
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

              <div className="border-t border-border pt-2 flex flex-col gap-1">
                {(order.items || []).map((it, idx) => {
                  const opts = formatItemOptions(it)
                  return (
                    <div key={idx} className="text-sm">
                      <div className="flex justify-between">
                        <span className="font-semibold">
                          {it.qty}× {it.name}
                        </span>
                        <span className="text-ink-muted">{rupiah(it.price * it.qty)}</span>
                      </div>
                      {it.isBundle && Array.isArray(it.bundleSlots) ? (
                        <div className="mt-1.5 pl-4 space-y-1">
                          {it.bundleSlots.map((slot, sIdx) => (
                            <div key={sIdx} className="text-xs bg-sage-light/50 rounded-lg p-2 border border-sage-dark/20 text-slate-800">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-sage-dark">
                                  {slot.slotTitle || `Cup ${sIdx + 1}`}: {slot.drinkName}
                                </span>
                                {slot.topping && (
                                  <span className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-sage-dark/20 font-semibold">
                                    + {slot.toppingLabel}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-600 flex flex-wrap gap-1.5 mt-0.5 font-medium">
                                <span>{slot.sugarLabel}</span>
                                <span>•</span>
                                <span>{slot.iceLabel}</span>
                                {slot.note && <span className="text-amber-700 italic">• "{slot.note}"</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        opts && <p className="text-xs text-ink-muted mt-0.5 pl-5">{opts}</p>
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
                  className="w-full border border-sage text-sage-dark text-sm font-semibold py-2 rounded-xl hover:bg-sage-light transition-colors"
                >
                  Tandai sudah dibayar
                </button>
              )}

              {(order.status === 'menunggu' || order.status === 'diproses' || order.status === 'siap') && (
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => advance(order)}
                    className="flex-1 bg-sage text-white text-sm font-semibold py-2 rounded-xl hover:bg-sage-dark transition-colors"
                  >
                    {nextActionLabel[order.status]}
                  </button>
                  {order.status !== 'siap' && (
                    <button
                      onClick={() => cancelOrder(order)}
                      className="px-3 py-2 rounded-xl border border-border text-danger text-sm font-semibold hover:bg-red-50 transition-colors"
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