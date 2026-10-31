import { useEffect, useMemo, useRef, useState } from 'react'
import TopNav from '../components/TopNav.jsx'
import { listenToMenuItemsAdmin } from '../api/menu.js'
import { listenToOptionGroupsAdmin } from '../api/optionGroups.js'
import { createPosOrder, findMemberByPhone } from '../api/orders.js'
import { seedMenuItems } from '../data/seedMenu.js'
import { seedOptionGroups } from '../data/seedOptionGroups.js'
import {
  resolveOptions,
  normalizeSelection,
  validateSelection,
  buildSelectedOptions,
  computeUnitPrice,
  formatItemOptions,
  lineKey,
  getItemCustomizationDetails,
  isFoodCategory,
  isSignatureCategory,
} from '../utils/options.js'
import { playChime } from '../utils/chime.js'

function rupiah(n) {
  return `Rp${Number(n || 0).toLocaleString('id-ID')}`
}

// Icon mapper untuk pilihan gula, es, & topping agar sama dengan customer
const CHOICE_ICONS = {
  // Gula
  normal: 'water_drop',
  less: 'opacity',
  no: 'block',
  g100: 'water_drop',
  g50: 'opacity',
  g0: 'block',
  // Es
  es_normal: 'ac_unit',
  es_less: 'severe_cold',
  es_no: 'block',
  sedikit: 'severe_cold',
  tanpa: 'block',
  panas: 'local_fire_department',
  // Topping
  pearl: 'bubble_chart',
  grass_jelly: 'layers',
  jelly: 'layers',
  nata: 'grain',
  aloe: 'spa',
  lemon: 'lunch_dining',
}

const CATEGORY_LABELS = {
  all: 'Semua Menu',
  signature: 'Signature Tea',
  milktea: 'Milk Tea',
  fruit: 'Fruit Tea',
  customizable: 'Bisa Kustom',
  topping: 'Topping & Snack',
}

export default function PosAdmin() {
  // --- Data Menu & Grup ---
  const [menuItems, setMenuItems] = useState([])
  const [optionGroups, setOptionGroups] = useState([])
  const [loading, setLoading] = useState(true)

  // --- Filter & Pencarian Menu ---
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')

  // --- Keranjang Kasir ---
  const [cart, setCart] = useState([])

  // --- Data Pelanggan / Member ---
  const [memberQuery, setMemberQuery] = useState('')
  const [memberLoading, setMemberLoading] = useState(false)
  const [foundMembers, setFoundMembers] = useState([])
  const [selectedMember, setSelectedMember] = useState(null)
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')

  // --- Tipe Pesanan & Meja ---
  const [orderType, setOrderType] = useState('dine_in') // 'dine_in' | 'takeaway'
  const [tableNumber, setTableNumber] = useState('1')

  // --- Pembayaran ---
  const [paymentMethod, setPaymentMethod] = useState('cash') // 'cash' | 'qris' | 'debit'
  const [cashTendered, setCashTendered] = useState('')

  // --- Modal Kustomisasi Menu ---
  const [customizingItem, setCustomizingItem] = useState(null)
  const [customSelection, setCustomSelection] = useState({})
  const [customQty, setCustomQty] = useState(1)

  // --- Modal Transaksi Selesai ---
  const [submitting, setSubmitting] = useState(false)
  const [completedOrder, setCompletedOrder] = useState(null)

  // Ambil data menu dan optionGroups
  useEffect(() => {
    let unmounted = false

    const unsubMenu = listenToMenuItemsAdmin((items) => {
      if (unmounted) return
      setMenuItems(items.length > 0 ? items : seedMenuItems)
      setLoading(false)
    })

    const unsubGroups = listenToOptionGroupsAdmin((groups) => {
      if (unmounted) return
      setOptionGroups(groups.length > 0 ? groups : seedOptionGroups)
    })

    return () => {
      unmounted = true
      unsubMenu()
      unsubGroups()
    }
  }, [])

  // Cari member saat query berubah (debounce)
  useEffect(() => {
    const q = memberQuery.trim()
    if (q.length < 3) {
      setFoundMembers([])
      return
    }

    const timer = setTimeout(async () => {
      setMemberLoading(true)
      try {
        const res = await findMemberByPhone(q)
        setFoundMembers(res)
      } catch (err) {
        console.warn('Gagal mencari member:', err)
      } finally {
        setMemberLoading(false)
      }
    }, 350)

    return () => clearTimeout(timer)
  }, [memberQuery])

  // Hitung kategori yang ada
  const categories = useMemo(() => {
    const set = new Set()
    menuItems.forEach((m) => {
      if (m.category) set.add(m.category)
    })
    return ['all', ...Array.from(set)]
  }, [menuItems])

  // Filter menu berdasarkan search & kategori
  const filteredMenu = useMemo(() => {
    return menuItems.filter((item) => {
      if (item.inStock === false) return false
      const matchCat = activeCategory === 'all' || item.category === activeCategory
      const matchSearch =
        !search.trim() ||
        (item.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (item.desc || '').toLowerCase().includes(search.toLowerCase())
      return matchCat && matchSearch
    })
  }, [menuItems, activeCategory, search])

  // Total dan Subtotal
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.qty, 0)
  }, [cart])

  const total = subtotal

  // Hitung uang kembalian
  const cashNum = Number(cashTendered) || 0
  const change = Math.max(0, cashNum - total)
  const isCashSufficient = paymentMethod !== 'cash' || cashNum >= total

  // --- Handlers Keranjang ---
  function handleItemClick(item) {
    // Selalu buka modal kustomisasi (seperti di tampilan customer)
    // agar kasir bisa input catatan atau pilihan gula/es/topping
    setCustomizingItem(item)
    const resolved = resolveOptions(item, optionGroups)
    setCustomSelection(normalizeSelection(resolved, {}))
    setCustomQty(1)
  }

  function handleAddCustomizedToCart() {
    if (!customizingItem) return
    const resolved = resolveOptions(customizingItem, optionGroups)
    const { valid, errors } = validateSelection(resolved, customSelection)
    if (!valid) {
      alert(errors[0]?.message || 'Lengkapi pilihan kustomisasi.')
      return
    }

    const selectedOptions = buildSelectedOptions(resolved, customSelection)
    const unitPrice = computeUnitPrice(customizingItem, selectedOptions)
    const k = lineKey(customizingItem.id, selectedOptions)

    setCart((prev) => {
      const existIdx = prev.findIndex((p) => p.lineKey === k)
      if (existIdx >= 0) {
        const next = [...prev]
        next[existIdx] = { ...next[existIdx], qty: next[existIdx].qty + customQty }
        return next
      }
      return [
        ...prev,
        {
          id: customizingItem.id,
          name: customizingItem.name,
          category: customizingItem.category || '',
          price: unitPrice,
          basePrice: customizingItem.price || 0,
          qty: customQty,
          selectedOptions,
          lineKey: k,
        },
      ]
    })

    setCustomizingItem(null)
  }

  function updateCartQty(lineKeyStr, delta) {
    setCart((prev) =>
      prev
        .map((it) => {
          if (it.lineKey === lineKeyStr) {
            const nextQty = it.qty + delta
            return nextQty > 0 ? { ...it, qty: nextQty } : null
          }
          return it
        })
        .filter(Boolean)
    )
  }

  function removeFromCart(lineKeyStr) {
    setCart((prev) => prev.filter((it) => it.lineKey !== lineKeyStr))
  }

  function clearCart() {
    if (cart.length === 0) return
    if (confirm('Kosongkan keranjang pesanan kasir ini?')) {
      setCart([])
      setCashTendered('')
    }
  }

  // --- Handlers Member ---
  function selectMember(member) {
    setSelectedMember(member)
    setMemberQuery('')
    setFoundMembers([])
  }

  function removeMember() {
    setSelectedMember(null)
  }

  // --- Shortcut Uang Cepat ---
  function setQuickCash(val) {
    setCashTendered(String(val))
  }

  // --- Selesaikan Transaksi Kasir ---
  async function handleCheckout() {
    if (cart.length === 0) return
    if (!isCashSufficient) {
      alert(`Uang tunai kurang ${rupiah(total - cashNum)}!`)
      return
    }

    setSubmitting(true)

    const finalCustomerName = selectedMember?.displayName || guestName.trim() || 'Pelanggan Kasir'
    const finalCustomerPhone = selectedMember?.phone || guestPhone.trim() || ''
    const finalTable = orderType === 'takeaway' ? 'Takeaway' : tableNumber ? `Meja ${tableNumber}` : 'Kasir'

    const paymentLabel = {
      cash: 'Tunai (Kasir)',
      qris: 'QRIS (Kasir)',
      debit: 'Debit / EDC',
    }[paymentMethod]

    const orderData = {
      items: cart.map((it) => ({
        id: it.id,
        name: it.name,
        price: it.price,
        qty: it.qty,
        selectedOptions: it.selectedOptions || [],
      })),
      subtotal,
      total,
      paymentMethod: paymentLabel,
      paymentStatus: 'dibayar',
      status: 'diproses',
      tableNumber: finalTable,
      orderType,
      userId: selectedMember?.uid || null,
      customerName: finalCustomerName,
      customerPhone: finalCustomerPhone,
      cashTendered: paymentMethod === 'cash' ? cashNum : total,
      change: paymentMethod === 'cash' ? change : 0,
      source: 'pos_kasir',
    }

    try {
      const res = await createPosOrder(orderData)
      const pointsEarned = selectedMember ? Math.floor(total / 1000) : 0

      // Putar suara Cha-Ching!
      try {
        playChime(2)
      } catch {}

      setCompletedOrder({
        ...orderData,
        orderId: res.orderId,
        orderCode: res.orderCode,
        pointsEarned,
        currentPoints: (selectedMember?.points || 0) + pointsEarned,
      })
    } catch (err) {
      alert('Gagal memproses transaksi: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // --- Reset Setelah Transaksi ---
  function handleNewTransaction() {
    setCompletedOrder(null)
    setCart([])
    setCashTendered('')
    setSelectedMember(null)
    setGuestName('')
    setGuestPhone('')
    setPaymentMethod('cash')
    setTableNumber('1')
  }

  // --- Kirim Struk WhatsApp ---
  function sendWhatsAppReceipt(order) {
    if (!order) return
    const rawPhone = order.customerPhone || ''
    let phone = rawPhone.replace(/[\s-]/g, '').trim()
    if (phone.startsWith('0')) phone = '62' + phone.slice(1)
    if (phone.startsWith('+62')) phone = phone.slice(1)

    const receiptUrl = `https://justmine-tea-customer.vercel.app/receipt/${order.orderId}`
    const text =
      `*JUSTMINE TEA - STRUK RESMI* 🍵\n` +
      `Halo Kak *${order.customerName || 'Pelanggan'}*! Terima kasih sudah mampir dan pesan di Justmine Tea.\n\n` +
      `📋 *No. Pesanan:* #${order.orderCode}\n` +
      `📍 *Tipe:* ${order.tableNumber}\n` +
      `💳 *Metode:* ${order.paymentMethod}\n` +
      `💵 *Total:* ${rupiah(order.total)}\n` +
      (order.paymentMethod.includes('Tunai') ? `💵 *Kembalian:* ${rupiah(order.change)}\n` : '') +
      (order.pointsEarned ? `⭐ *Poin Didapat:* +${order.pointsEarned} Poin!\n` : '') +
      `\nBuka E-Receipt & lacak status pesananmu di sini:\n${receiptUrl}\n\n` +
      `Selamat menikmati kesegaran teh pilihanmu! ✨`

    if (!phone) {
      const ask = prompt('Masukkan nomor WhatsApp pelanggan (contoh: 08123456789):')
      if (!ask) return
      let p = ask.replace(/[\s-]/g, '').trim()
      if (p.startsWith('0')) p = '62' + p.slice(1)
      if (p.startsWith('+62')) p = p.slice(1)
      window.open(`https://wa.me/${p}?text=${encodeURIComponent(text)}`, '_blank')
    } else {
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank')
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* TopNav tersembunyi saat dicetak */}
      <div className="print:hidden">
        <TopNav />
      </div>

      <main className="max-w-[1440px] mx-auto px-4 py-4 print:hidden">
        {/* Banner Kasir Aktif */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 bg-surface rounded-2xl p-4 border border-border shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sage-light flex items-center justify-center text-sage-dark">
              <span className="material-symbols-outlined text-[24px]">point_of_sale</span>
            </div>
            <div>
              <h1 className="text-lg font-bold">Kasir (Point of Sale)</h1>
              <p className="text-xs text-ink-muted">Pesanan langsung di counter · Kasir &amp; Takeaway</p>
            </div>
          </div>

          {/* Selector Tipe Pesanan */}
          <div className="flex items-center gap-2 bg-background p-1 rounded-xl border border-border">
            <button
              onClick={() => setOrderType('dine_in')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                orderType === 'dine_in' ? 'bg-sage text-white shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">restaurant</span>
              Dine-In
            </button>
            <button
              onClick={() => setOrderType('takeaway')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                orderType === 'takeaway' ? 'bg-sage text-white shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">shopping_bag</span>
              Takeaway
            </button>
          </div>

          {/* Nomor Meja jika Dine In */}
          {orderType === 'dine_in' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-ink-muted">Meja:</span>
              <input
                type="text"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                placeholder="No. Meja"
                className="w-20 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-border bg-surface text-center focus:ring-2 focus:ring-sage focus:outline-none"
              />
              <div className="hidden sm:flex gap-1">
                {['1', '2', '3', '4', '5'].map((n) => (
                  <button
                    key={n}
                    onClick={() => setTableNumber(n)}
                    className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors ${
                      tableNumber === n ? 'bg-sage-dark text-white' : 'bg-surface border border-border text-ink-muted hover:bg-sage-light'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Layout 2 Kolom: Kiri Menu, Kanan Keranjang & Pembayaran */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* ================= KOLOM KIRI: MENU KATALOG ================= */}
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-4">
            {/* Search & Category Tabs */}
            <div className="bg-surface rounded-2xl p-4 border border-border shadow-sm flex flex-col gap-3">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-ink-muted text-[20px]">
                  search
                </span>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari menu teh, latte, topping..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl text-sm border border-border bg-background focus:outline-none focus:ring-2 focus:ring-sage"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-2.5 text-ink-muted hover:text-ink text-xs font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Kategori Tabs */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                      activeCategory === cat
                        ? 'bg-sage text-white shadow-sm'
                        : 'bg-background border border-border text-ink-muted hover:bg-sage-light hover:text-sage-dark'
                    }`}
                  >
                    {CATEGORY_LABELS[cat] || cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Menu Grid */}
            {loading ? (
              <div className="bg-surface rounded-2xl p-12 text-center text-ink-muted border border-border">
                <div className="w-8 h-8 rounded-full border-2 border-sage border-t-transparent animate-spin mx-auto mb-3" />
                <p className="text-sm">Memuat menu Justmine Tea...</p>
              </div>
            ) : filteredMenu.length === 0 ? (
              <div className="bg-surface rounded-2xl p-12 text-center text-ink-muted border border-dashed border-border">
                <span className="material-symbols-outlined text-[36px] mb-2 opacity-50">search_off</span>
                <p className="text-sm font-semibold">Tidak ada menu yang sesuai.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredMenu.map((item) => {
                  const resolved = resolveOptions(item, optionGroups)
                  const isCustom = resolved.length > 0
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      role="button"
                      tabIndex={0}
                      className="group bg-surface rounded-2xl p-3 border border-border hover:border-sage hover:shadow-md transition-all cursor-pointer flex flex-col justify-between text-left select-none"
                    >
                      <div>
                        {/* Gambar / Placeholder */}
                        <div className="w-full aspect-[4/3] rounded-xl bg-sage-light/60 mb-2 overflow-hidden relative flex items-center justify-center">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                            />
                          ) : (
                            <div className="text-3xl">🍵</div>
                          )}
                          {isCustom && (
                            <span className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded-md bg-black/60 text-white text-[10px] font-bold backdrop-blur-sm flex items-center gap-0.5">
                              <span className="material-symbols-outlined text-[12px]">tune</span>
                              Kustom
                            </span>
                          )}
                        </div>

                        {/* Nama & Deskripsi */}
                        <h3 className="font-bold text-sm text-ink line-clamp-1 group-hover:text-sage-dark transition-colors">
                          {item.name}
                        </h3>
                        {item.desc && (
                          <p className="text-[11px] text-ink-muted line-clamp-2 mt-0.5 leading-snug">{item.desc}</p>
                        )}
                      </div>

                      {/* Harga & Tombol Tambah */}
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/60">
                        <span className="font-bold text-sm text-sage-dark">{rupiah(item.price)}</span>
                        <div className="w-7 h-7 rounded-full bg-sage-light text-sage-dark group-hover:bg-sage group-hover:text-white flex items-center justify-center transition-colors">
                          <span className="material-symbols-outlined text-[16px]">add</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ================= KOLOM KANAN: MEMBER, CART & PEMBAYARAN ================= */}
          <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-4 sticky top-16">
            {/* 1. KARTU MEMBER / LOYALTY */}
            <div className="bg-surface rounded-2xl p-4 border border-border shadow-sm">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-ink">
                  <span className="material-symbols-outlined text-sage text-[18px]">workspace_premium</span>
                  <span>Member Loyalty</span>
                </div>
                {selectedMember && (
                  <button
                    onClick={removeMember}
                    className="text-[11px] font-semibold text-danger hover:underline"
                  >
                    Ganti Member
                  </button>
                )}
              </div>

              {selectedMember ? (
                /* Member Terpilih */
                <div className="p-3 rounded-xl bg-sage-light/60 border border-sage/30 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-sage text-white font-bold flex items-center justify-center text-sm shrink-0">
                      {(selectedMember.displayName || 'M')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-ink truncate">{selectedMember.displayName || 'Member'}</p>
                      <p className="text-[11px] text-ink-muted">{selectedMember.phone || selectedMember.email || '—'}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-sage/30 text-sage-dark font-bold text-xs">
                      ⭐ {selectedMember.points || 0}
                    </div>
                    <p className="text-[10px] text-sage-dark font-medium mt-0.5">+{Math.floor(total / 1000)} poin order ini</p>
                  </div>
                </div>
              ) : (
                /* Cari Member via No. WA / Nama */
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-2 text-ink-muted text-[18px]">
                      person_search
                    </span>
                    <input
                      type="text"
                      value={memberQuery}
                      onChange={(e) => setMemberQuery(e.target.value)}
                      placeholder="Cari No. WhatsApp / Nama member..."
                      className="w-full pl-9 pr-3 py-1.5 rounded-xl text-xs border border-border bg-background focus:outline-none focus:ring-2 focus:ring-sage"
                    />
                    {memberLoading && (
                      <div className="absolute right-3 top-2 w-4 h-4 border-2 border-sage border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>

                  {/* Dropdown hasil pencarian member */}
                  {foundMembers.length > 0 && (
                    <div className="bg-surface border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto divide-y divide-border/60">
                      {foundMembers.map((m) => (
                        <div
                          key={m.uid}
                          onClick={() => selectMember(m)}
                          className="p-2.5 hover:bg-sage-light cursor-pointer flex items-center justify-between transition-colors"
                        >
                          <div>
                            <p className="font-bold text-xs text-ink">{m.displayName || 'Member'}</p>
                            <p className="text-[11px] text-ink-muted">{m.phone || m.email}</p>
                          </div>
                          <span className="text-[11px] font-bold text-sage-dark">⭐ {m.points || 0} Poin</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Input nama tamu jika bukan member */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Nama Tamu (opsional)"
                      className="flex-1 px-2.5 py-1.5 rounded-xl text-xs border border-border bg-background focus:outline-none focus:ring-1 focus:ring-sage"
                    />
                    <input
                      type="tel"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      placeholder="No. WA Tamu (struk)"
                      className="flex-1 px-2.5 py-1.5 rounded-xl text-xs border border-border bg-background focus:outline-none focus:ring-1 focus:ring-sage"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 2. DAFTAR KERANJANG KASIR */}
            <div className="bg-surface rounded-2xl p-4 border border-border shadow-sm flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div className="flex items-center gap-1.5 font-bold text-sm">
                  <span className="material-symbols-outlined text-[18px]">shopping_cart</span>
                  <span>Pesanan Kasir</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sage-light text-sage-dark">
                    {cart.reduce((s, it) => s + it.qty, 0)} item
                  </span>
                </div>
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-xs text-ink-muted hover:text-danger font-semibold transition-colors"
                  >
                    Kosongkan
                  </button>
                )}
              </div>

              {/* List Items */}
              <div className="min-h-[160px] max-h-[300px] overflow-y-auto py-2 flex flex-col gap-2">
                {cart.length === 0 ? (
                  <div className="py-10 text-center text-ink-muted flex flex-col items-center justify-center">
                    <span className="material-symbols-outlined text-[36px] opacity-40 mb-1">
                      remove_shopping_cart
                    </span>
                    <p className="text-xs font-semibold">Keranjang masih kosong.</p>
                    <p className="text-[11px] opacity-80">Klik menu di samping untuk menambahkan.</p>
                  </div>
                ) : (
                  cart.map((it) => {
                    const badges = getItemCustomizationDetails(it)
                    const opts = formatItemOptions(it)
                    return (
                      <div
                        key={it.lineKey}
                        className="p-2.5 rounded-xl bg-background border border-border flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-xs text-ink">{it.name}</p>
                          {badges.length > 0 ? (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {badges.map((b, idx) => (
                                <span
                                  key={idx}
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] border ${b.bgClass}`}
                                >
                                  <span className={`material-symbols-outlined text-[12px] ${b.iconColor}`}>
                                    {b.icon}
                                  </span>
                                  <span>{b.label}</span>
                                </span>
                              ))}
                            </div>
                          ) : opts ? (
                            <p className="text-[11px] text-ink-muted leading-tight mt-0.5">{opts}</p>
                          ) : null}
                          <p className="text-xs font-semibold text-sage-dark mt-1">
                            {rupiah(it.price * it.qty)}
                            {it.qty > 1 && <span className="text-[10px] text-ink-muted ml-1">({rupiah(it.price)}/cup)</span>}
                          </p>
                        </div>

                        {/* Stepper Qty */}
                        <div className="flex items-center gap-1 shrink-0 bg-surface rounded-lg border border-border p-0.5">
                          <button
                            onClick={() => updateCartQty(it.lineKey, -1)}
                            className="w-6 h-6 rounded flex items-center justify-center text-ink-muted hover:bg-sage-light hover:text-sage-dark text-xs font-bold"
                          >
                            -
                          </button>
                          <span className="w-5 text-center font-bold text-xs">{it.qty}</span>
                          <button
                            onClick={() => updateCartQty(it.lineKey, 1)}
                            className="w-6 h-6 rounded flex items-center justify-center text-ink-muted hover:bg-sage-light hover:text-sage-dark text-xs font-bold"
                          >
                            +
                          </button>
                          <button
                            onClick={() => removeFromCart(it.lineKey)}
                            title="Hapus"
                            className="w-6 h-6 ml-0.5 rounded flex items-center justify-center text-ink-muted hover:text-danger hover:bg-red-50 text-xs"
                          >
                            <span className="material-symbols-outlined text-[14px]">delete</span>
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Rincian Total */}
              <div className="border-t border-border pt-3 mt-1 flex flex-col gap-1.5">
                <div className="flex justify-between text-xs text-ink-muted">
                  <span>Subtotal</span>
                  <span>{rupiah(subtotal)}</span>
                </div>
                <div className="flex justify-between items-baseline font-extrabold text-base text-ink">
                  <span>Total Tagihan</span>
                  <span className="text-lg text-sage-dark">{rupiah(total)}</span>
                </div>
              </div>
            </div>

            {/* 3. METODE PEMBAYARAN & HITUNG KEMBALIAN */}
            <div className="bg-surface rounded-2xl p-4 border border-border shadow-sm flex flex-col gap-3">
              <span className="text-xs font-bold text-ink">Pilih Metode Pembayaran:</span>

              {/* Tabs Metode Bayar */}
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { key: 'cash', label: 'Tunai (Cash)', icon: 'payments' },
                  { key: 'qris', label: 'QRIS Kasir', icon: 'qr_code_scanner' },
                  { key: 'debit', label: 'Debit / EDC', icon: 'credit_card' },
                ].map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setPaymentMethod(m.key)}
                    className={`p-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 border transition-all ${
                      paymentMethod === m.key
                        ? 'bg-sage-dark text-white border-transparent shadow-sm'
                        : 'bg-background border-border text-ink-muted hover:bg-sage-light hover:text-sage-dark'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px]">{m.icon}</span>
                    <span className="text-[11px]">{m.label}</span>
                  </button>
                ))}
              </div>

              {/* Bagian Uang Tunai & Kembalian */}
              {paymentMethod === 'cash' && (
                <div className="p-3 rounded-xl bg-background border border-border flex flex-col gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                      Uang Diterima dari Pelanggan:
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-ink-muted">Rp</span>
                      <input
                        type="number"
                        value={cashTendered}
                        onChange={(e) => setCashTendered(e.target.value)}
                        placeholder="0"
                        className="w-full pl-9 pr-3 py-1.5 rounded-lg text-sm font-bold border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-sage"
                      />
                    </div>
                  </div>

                  {/* Tombol Shortcut Uang Cepat */}
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setQuickCash(total)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-surface border border-border hover:bg-sage-light hover:text-sage-dark"
                    >
                      Uang Pas
                    </button>
                    {[20000, 50000, 100000].map((nominal) => (
                      <button
                        key={nominal}
                        onClick={() => setQuickCash(nominal)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-surface border border-border hover:bg-sage-light hover:text-sage-dark"
                      >
                        {rupiah(nominal)}
                      </button>
                    ))}
                  </div>

                  {/* Banner Kembalian */}
                  {cashNum > 0 && (
                    <div
                      className={`p-2.5 rounded-lg border flex items-center justify-between text-xs font-bold ${
                        cashNum >= total
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : 'bg-amber-50 border-amber-300 text-amber-800'
                      }`}
                    >
                      <span>{cashNum >= total ? 'Kembalian:' : 'Uang Kurang:'}</span>
                      <span className="text-sm">
                        {cashNum >= total ? rupiah(change) : rupiah(total - cashNum)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {paymentMethod === 'qris' && (
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-blue-600 shrink-0">info</span>
                  <span>Arahkan pelanggan scan kode QRIS statis / EDC di meja kasir.</span>
                </div>
              )}

              {paymentMethod === 'debit' && (
                <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-xs flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-purple-600 shrink-0">credit_card</span>
                  <span>Proses pembayaran melalui mesin EDC bank di meja kasir.</span>
                </div>
              )}

              {/* Tombol Selesaikan Transaksi */}
              <button
                onClick={handleCheckout}
                disabled={cart.length === 0 || !isCashSufficient || submitting}
                className="w-full py-3.5 rounded-xl bg-sage hover:bg-sage-dark disabled:bg-gray-300 text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2 mt-1"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Memproses Transaksi...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[20px]">check_circle</span>
                    <span>Bayar &amp; Proses ({rupiah(total)})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* ================= MODAL KUSTOMISASI MENU (SAMA DENGAN CUSTOMER) ================= */}
      {customizingItem && (() => {
        const resolved = resolveOptions(customizingItem, optionGroups)
        const isFoodOrSweets = isFoodCategory(customizingItem)
        const isNoTopping = isFoodOrSweets || isSignatureCategory(customizingItem.category)

        const sugarGroup = !isFoodOrSweets
          ? resolved.find((g) => g.id === 'gula') || {
              id: 'gula',
              label: 'Tingkat Kemanisan',
              choices: [
                { id: 'normal', label: 'Normal (100%)', priceDelta: 0 },
                { id: 'less', label: 'Sedikit (50%)', priceDelta: 0 },
                { id: 'no', label: 'Tanpa Gula (0%)', priceDelta: 0 },
              ],
            }
          : null

        const iceGroup = !isFoodOrSweets
          ? resolved.find((g) => g.id === 'es') || {
              id: 'es',
              label: 'Tingkat Es Batu',
              choices: [
                { id: 'normal', label: 'Normal Ice', priceDelta: 0 },
                { id: 'less', label: 'Sedikit Es', priceDelta: 0 },
                { id: 'no', label: 'Tanpa Es', priceDelta: 0 },
              ],
            }
          : null

        const toppingGroup = !isNoTopping
          ? resolved.find((g) => g.id === 'topping' || g.id === 'topping_tea' || g.type === 'multi') || {
              id: 'topping',
              label: 'Topping Tambahan',
              type: 'multi',
              choices: [
                { id: 'top-boba', label: 'Pearl / Boba', priceDelta: 3000 },
                { id: 'top-grass', label: 'Grass Jelly', priceDelta: 3000 },
                { id: 'top-nata', label: 'Nata de Coco', priceDelta: 3000 },
                { id: 'top-aloe', label: 'Aloe Vera', priceDelta: 4000 },
              ],
            }
          : null

        const otherGroups = resolved.filter(
          (g) => g.id !== 'gula' && g.id !== 'es' && g.id !== 'catatan' && g.id !== toppingGroup?.id
        )

        const selectedToppings = (toppingGroup && Array.isArray(customSelection[toppingGroup.id]))
          ? customSelection[toppingGroup.id]
          : []
        const toppingDelta = selectedToppings.reduce((sum, tid) => {
          const c = toppingGroup?.choices.find((ch) => ch.id === tid)
          return sum + (c?.priceDelta ?? 0)
        }, 0)
        const basePrice = customizingItem.price || 0
        const modalUnitPrice = basePrice + toppingDelta
        const modalGrandTotal = modalUnitPrice * customQty

        return (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
            {/* Backdrop click to close */}
            <div className="fixed inset-0" onClick={() => setCustomizingItem(null)} aria-hidden="true" />

            {/* Container */}
            <div className="relative z-10 w-full sm:max-w-4xl bg-surface rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[88vh] animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-250">
              {/* Drag Handle (Mobile Only) */}
              <div className="sm:hidden w-full flex items-center justify-center pt-3 pb-1">
                <div className="w-12 h-1.5 rounded-full bg-border" />
              </div>

              {/* Header Modal */}
              <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-border flex items-center justify-between shrink-0 bg-surface/95 backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomizingItem(null)}
                    aria-label="Kembali"
                    className="w-9 h-9 rounded-full flex items-center justify-center text-ink hover:bg-sage-light active:scale-95 transition-all -ml-1"
                  >
                    <span className="material-symbols-outlined text-[22px]">arrow_back</span>
                  </button>
                  <div className="flex flex-col">
                    <span className="text-[10px] sm:text-xs font-bold tracking-wider text-sage-dark uppercase">
                      Justmine Tea — Kasir POS
                    </span>
                    <h2 className="text-sm sm:text-base font-bold text-ink leading-tight">
                      {isFoodOrSweets ? 'Catatan & Kustom Makanan' : 'Kustomisasi Minuman'}
                    </h2>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setCustomizingItem(null)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-ink-muted hover:bg-sage-light transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {/* Content Body: Split 2 Kolom di Desktop, Stack di Mobile */}
              <div className="overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 pb-28">
                {/* ================= KIRI: DETAIL PRODUK & FOTO ================= */}
                <div className="lg:col-span-5 flex flex-col gap-3 min-w-0">
                  <div className="relative w-full aspect-[4/3] rounded-2xl sm:rounded-3xl overflow-hidden shadow-sm bg-sage-light/60 flex items-center justify-center">
                    {customizingItem.imageUrl ? (
                      <img
                        src={customizingItem.imageUrl}
                        alt={customizingItem.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-5xl">🍵</span>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

                    <div className="absolute top-3 left-3 flex items-center gap-1.5">
                      <span className="px-2.5 py-1 rounded-full bg-sage text-white text-[11px] font-bold shadow-sm capitalize">
                        {customizingItem.category ? `${customizingItem.category}` : 'Menu Spesial'}
                      </span>
                    </div>

                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white text-[11px] font-medium">
                      <span className="flex items-center gap-1 bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-full">
                        <span className="material-symbols-outlined text-[15px] text-sage-light">eco</span>
                        Pilihan Kasir
                      </span>
                      <span className="flex items-center gap-1 bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-full">
                        <span className="material-symbols-outlined text-[15px] text-amber-300">verified</span>
                        Bisa Kustom
                      </span>
                    </div>
                  </div>

                  {/* Detail Info Card */}
                  <div className="bg-surface rounded-2xl p-4 border border-border flex flex-col gap-1.5 shadow-xs min-w-0 overflow-hidden">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-xl sm:text-2xl font-bold text-ink leading-tight break-words">
                          {customizingItem.name}
                        </h3>
                        <p className="text-xs text-sage-dark font-medium mt-0.5">
                          Kategori: {customizingItem.category || 'Teh Nusantara'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-lg sm:text-xl font-extrabold text-sage-dark block">
                          {rupiah(basePrice)}
                        </span>
                        <span className="text-[10px] text-ink-muted">Harga Dasar</span>
                      </div>
                    </div>

                    <p className="text-xs text-ink-muted leading-relaxed mt-1 break-words">
                      {customizingItem.desc || 'Seduhan artisan daun teh alami dengan racikan segar pilihan.'}
                    </p>

                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/60 mt-1">
                      {!isFoodOrSweets && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-sage-light text-sage-dark text-[11px] font-medium">
                          <span className="material-symbols-outlined text-[13px]">ac_unit</span>
                          Iced Drink
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-background text-ink-muted text-[11px] font-medium">
                        <span className="material-symbols-outlined text-[13px]">{isFoodOrSweets ? 'bakery_dining' : 'local_drink'}</span>
                        {isFoodOrSweets ? 'Food / Snack' : 'Cup 500ml'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ================= KANAN: STEP RACIKAN KUSTOMISASI ================= */}
                <div className="lg:col-span-7 flex flex-col gap-4 min-w-0">
                  {/* STEP 1: Tingkat Kemanisan */}
                  {sugarGroup && (
                    <div className="bg-surface rounded-2xl p-4 border border-border shadow-xs flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-sage text-white text-[11px] flex items-center justify-center font-bold">
                            1
                          </span>
                          <h4 className="font-bold text-sm text-ink">{sugarGroup.label}</h4>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-sage-light text-sage-dark text-[10px] font-bold">
                          WAJIB
                        </span>
                      </div>
                      <p className="text-xs text-ink-muted">Pilih takaran kemanisan teh dari customer:</p>

                      <div className="grid grid-cols-3 gap-2">
                        {sugarGroup.choices.map((c) => {
                          const picked = (customSelection.gula || ['normal']).includes(c.id)
                          const icon = CHOICE_ICONS[c.id] || 'water_drop'
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setCustomSelection((prev) => ({ ...prev, gula: [c.id] }))}
                              className={`w-full py-2.5 px-2 rounded-xl text-center flex flex-col items-center justify-center gap-1 transition-all border ${
                                picked
                                  ? 'bg-sage text-white border-sage shadow-xs'
                                  : 'bg-background text-ink border-border hover:border-sage'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[20px]">{icon}</span>
                              <span className="text-xs font-semibold">{c.label}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* STEP 2: Tingkat Es Batu */}
                  {iceGroup && (
                    <div className="bg-surface rounded-2xl p-4 border border-border shadow-xs flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-sage text-white text-[11px] flex items-center justify-center font-bold">
                            2
                          </span>
                          <h4 className="font-bold text-sm text-ink">{iceGroup.label}</h4>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-sage-light text-sage-dark text-[10px] font-bold">
                          WAJIB
                        </span>
                      </div>
                      <p className="text-xs text-ink-muted">Pilih kadar dingin es batu:</p>

                      <div className="grid grid-cols-3 gap-2">
                        {iceGroup.choices.map((c) => {
                          const picked = (customSelection.es || ['normal']).includes(c.id)
                          const icon = CHOICE_ICONS[c.id] || CHOICE_ICONS[`es_${c.id}`] || 'ac_unit'
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setCustomSelection((prev) => ({ ...prev, es: [c.id] }))}
                              className={`w-full py-2.5 px-2 rounded-xl text-center flex flex-col items-center justify-center gap-1 transition-all border ${
                                picked
                                  ? 'bg-sage text-white border-sage shadow-xs'
                                  : 'bg-background text-ink border-border hover:border-sage'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[20px]">{icon}</span>
                              <span className="text-xs font-semibold">{c.label}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* STEP 3: Topping Tambahan (Hanya muncul jika item mendukung topping) */}
                  {toppingGroup && (
                    <div className="bg-surface rounded-2xl p-4 border border-border shadow-xs flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-sage-dark text-white text-[11px] flex items-center justify-center font-bold">
                            3
                          </span>
                          <h4 className="font-bold text-sm text-ink">{toppingGroup.label}</h4>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-background text-ink-muted text-[10px] font-semibold">
                          BISA PILIH LEBIH DARI SATU
                        </span>
                      </div>
                      <p className="text-xs text-ink-muted">Pilihan topping lezat Justmine Tea:</p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {toppingGroup.choices.map((c) => {
                          const picked = (customSelection[toppingGroup.id] || []).includes(c.id)
                          const icon = CHOICE_ICONS[c.id] || 'bubble_chart'
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                const current = Array.isArray(customSelection[toppingGroup.id])
                                  ? customSelection[toppingGroup.id]
                                  : []
                                const next = current.includes(c.id)
                                  ? current.filter((id) => id !== c.id)
                                  : [...current, c.id]
                                setCustomSelection((prev) => ({ ...prev, [toppingGroup.id]: next }))
                              }}
                              className={`w-full p-2.5 rounded-xl border transition-all flex items-center justify-between text-left shadow-xs ${
                                picked
                                  ? 'bg-sage-light/70 border-sage'
                                  : 'bg-background border-border hover:border-sage'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                    picked ? 'bg-sage text-white' : 'bg-surface text-ink'
                                  }`}
                                >
                                  <span className="material-symbols-outlined text-[18px]">{icon}</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-xs font-bold text-ink">{c.label}</span>
                                  <span className="text-[11px] font-semibold text-sage-dark">
                                    +{rupiah(c.priceDelta)}
                                  </span>
                                </div>
                              </div>

                              <div
                                className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                                  picked
                                    ? 'bg-sage border-sage text-white'
                                    : 'border-border text-transparent'
                                }`}
                              >
                                <span className="material-symbols-outlined text-[14px]">done</span>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Grup Opsi Tambahan Lainnya (jika ada) */}
                  {otherGroups.map((g) => {
                    const picked = customSelection[g.id] || []
                    return (
                      <div key={g.id} className="bg-surface rounded-2xl p-4 border border-border shadow-xs flex flex-col gap-2.5">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-ink">{g.label}</span>
                          {g.required && <span className="text-[10px] text-danger font-bold">*Wajib</span>}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {g.choices.map((c) => {
                            const isPicked = picked.includes(c.id)
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  if (g.type === 'single') {
                                    setCustomSelection((prev) => ({ ...prev, [g.id]: [c.id] }))
                                  } else {
                                    const next = isPicked ? picked.filter((id) => id !== c.id) : [...picked, c.id]
                                    setCustomSelection((prev) => ({ ...prev, [g.id]: next }))
                                  }
                                }}
                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                                  isPicked
                                    ? 'bg-sage text-white border-transparent shadow-sm'
                                    : 'bg-background border-border text-ink-muted hover:border-sage'
                                }`}
                              >
                                {c.label} {c.priceDelta ? `(+${rupiah(c.priceDelta)})` : ''}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}

                  {/* Catatan untuk Barista / Dapur */}
                  <div className="bg-surface rounded-2xl p-4 border border-border shadow-xs flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-background text-ink-muted text-[11px] flex items-center justify-center font-bold">
                          {isFoodOrSweets ? '1' : toppingGroup ? '4' : '3'}
                        </span>
                        <h4 className="font-bold text-sm text-ink">
                          {isFoodOrSweets ? 'Catatan Pesanan Dapur' : 'Catatan Khusus untuk Barista'}
                        </h4>
                      </div>
                      <span className="text-[10px] text-ink-muted font-medium">Maks. 80 Karakter</span>
                    </div>
                    <input
                      type="text"
                      value={customSelection.catatan || ''}
                      onChange={(e) =>
                        setCustomSelection((prev) => ({ ...prev, catatan: e.target.value.slice(0, 80) }))
                      }
                      maxLength={80}
                      placeholder={
                        isFoodOrSweets
                          ? 'Contoh: Hangatkan dulu, saus dipisah, jangan terlalu asin...'
                          : 'Contoh: Es dipisah, sedotan dua, minta cup holder...'
                      }
                      className="w-full bg-background text-ink rounded-xl px-3.5 py-2 text-xs placeholder:text-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-sage border border-border transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* ================= BOTTOM ACTION BAR (STICKY) ================= */}
              <div className="sticky bottom-0 inset-x-0 z-20 bg-surface/95 backdrop-blur-xl border-t border-border px-4 py-3 sm:px-6 sm:py-3.5 shadow-lg flex items-center justify-between gap-3">
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-sage-dark">
                    Subtotal Item
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-base sm:text-lg font-extrabold text-ink tracking-tight">
                      {rupiah(modalGrandTotal)}
                    </span>
                  </div>
                  {/* Stepper Qty */}
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setCustomQty((q) => Math.max(1, q - 1))}
                      className="w-6 h-6 rounded-full bg-background hover:bg-border flex items-center justify-center text-ink active:scale-95 transition-all text-xs font-bold"
                    >
                      -
                    </button>
                    <span className="text-xs font-bold text-ink w-4 text-center">{customQty}</span>
                    <button
                      type="button"
                      onClick={() => setCustomQty((q) => Math.min(20, q + 1))}
                      className="w-6 h-6 rounded-full bg-background hover:bg-border flex items-center justify-center text-ink active:scale-95 transition-all text-xs font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Tombol Simpan ke Keranjang Kasir */}
                <button
                  type="button"
                  onClick={handleAddCustomizedToCart}
                  className="flex-1 py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm text-white bg-sage hover:bg-sage-dark active:scale-[0.98] shadow-md transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">shopping_cart</span>
                  <span className="truncate">Tambah ke Pesanan Kasir • {rupiah(modalGrandTotal)}</span>
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ================= MODAL TRANSAKSI BERHASIL & STRUK ================= */}
      {completedOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 p-6 flex flex-col items-center text-center">
            {/* Animasi Ikon Sukses */}
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-[36px]">check_circle</span>
            </div>

            <h2 className="text-xl font-extrabold text-ink">Transaksi Berhasil!</h2>
            <p className="text-xs text-ink-muted mt-0.5">Pesanan otomatis masuk ke antrean dapur.</p>

            {/* Badge Kode Pesanan */}
            <div className="my-3 px-4 py-1.5 rounded-full bg-sage-light text-sage-dark font-mono font-bold text-lg border border-sage/30">
              #{completedOrder.orderCode}
            </div>

            {/* Rincian Finansial */}
            <div className="w-full bg-background rounded-2xl p-4 border border-border my-2 flex flex-col gap-2 text-xs">
              <div className="flex justify-between">
                <span className="text-ink-muted">Tipe / Lokasi:</span>
                <span className="font-bold text-ink">{completedOrder.tableNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Metode Pembayaran:</span>
                <span className="font-bold text-ink">{completedOrder.paymentMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Total Pembayaran:</span>
                <span className="font-bold text-sage-dark">{rupiah(completedOrder.total)}</span>
              </div>
              {completedOrder.paymentMethod.includes('Tunai') && (
                <>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Uang Diterima:</span>
                    <span className="font-semibold text-ink">{rupiah(completedOrder.cashTendered)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-emerald-700 pt-1 border-t border-border">
                    <span>Kembalian:</span>
                    <span className="text-sm">{rupiah(completedOrder.change)}</span>
                  </div>
                </>
              )}
              {completedOrder.pointsEarned > 0 && (
                <div className="flex justify-between font-bold text-sage-dark pt-1 border-t border-border">
                  <span>Poin Member Didapat:</span>
                  <span>+{completedOrder.pointsEarned} Poin (Total: {completedOrder.currentPoints})</span>
                </div>
              )}
            </div>

            {/* Tombol Aksi: WhatsApp, Cetak, Transaksi Baru */}
            <div className="w-full flex flex-col gap-2 mt-3">
              {/* WhatsApp Button */}
              <button
                onClick={() => sendWhatsAppReceipt(completedOrder)}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">chat</span>
                <span>Kirim Struk via WhatsApp (Gratis)</span>
              </button>

              {/* Cetak Struk */}
              <button
                onClick={() => window.print()}
                className="w-full py-2.5 px-4 rounded-xl bg-surface border border-border hover:bg-background text-ink font-bold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">print</span>
                <span>Cetak Struk Kertas (Thermal)</span>
              </button>

              {/* Transaksi Baru */}
              <button
                onClick={handleNewTransaction}
                className="w-full py-3 px-4 rounded-xl bg-sage hover:bg-sage-dark text-white font-extrabold text-sm shadow-md transition-colors mt-1"
              >
                Transaksi Baru ➔
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAMPILAN CETAK STRUK THERMAL (PRINT ONLY) ================= */}
      {completedOrder && (
        <div className="hidden print:block font-mono text-[11px] leading-tight text-black max-w-[280px] mx-auto p-2 bg-white">
          <div className="text-center mb-2">
            <img src="/icon.png" alt="Justmine Tea" className="w-12 h-12 mx-auto object-contain mb-1 rounded-full border border-neutral-300" />
            <h1 className="text-sm font-bold tracking-wider">JUSTMINE TEA</h1>
            <p className="text-[10px]">Fresh Tea &amp; Modern Brews</p>
            <p className="text-[9px]">Pamulang, Tangerang Selatan</p>
            <p className="border-b border-dashed border-black my-1" />
          </div>

          <div className="flex justify-between text-[10px]">
            <span>ID Pesanan: #{completedOrder.orderCode}</span>
            <span>{new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div className="text-[10px] mb-1">
            <p>Lokasi: {completedOrder.tableNumber}</p>
            <p>Pelanggan: {completedOrder.customerName}</p>
          </div>

          <p className="border-b border-dashed border-black my-1" />

          {/* Item Pesanan */}
          <div className="flex flex-col gap-1 my-1">
            {(completedOrder.items || []).map((it, idx) => (
              <div key={idx}>
                <div className="flex justify-between">
                  <span>
                    {it.qty}x {it.name}
                  </span>
                  <span>{rupiah(it.price * it.qty)}</span>
                </div>
                {formatItemOptions(it) && (
                  <p className="text-[9px] text-gray-700 pl-3 leading-none">{formatItemOptions(it)}</p>
                )}
              </div>
            ))}
          </div>

          <p className="border-b border-dashed border-black my-1" />

          {/* Rincian Bayar */}
          <div className="flex flex-col gap-0.5 my-1 text-[10px]">
            <div className="flex justify-between font-bold">
              <span>TOTAL</span>
              <span>{rupiah(completedOrder.total)}</span>
            </div>
            <div className="flex justify-between">
              <span>Metode</span>
              <span>{completedOrder.paymentMethod}</span>
            </div>
            {completedOrder.paymentMethod.includes('Tunai') && (
              <>
                <div className="flex justify-between">
                  <span>Tunai</span>
                  <span>{rupiah(completedOrder.cashTendered)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>KEMBALI</span>
                  <span>{rupiah(completedOrder.change)}</span>
                </div>
              </>
            )}
            {completedOrder.pointsEarned > 0 && (
              <div className="flex justify-between mt-1 text-[9px]">
                <span>Poin Didapat:</span>
                <span>+{completedOrder.pointsEarned} (Total: {completedOrder.currentPoints})</span>
              </div>
            )}
          </div>

          <p className="border-b border-dashed border-black my-1" />

          <div className="text-center text-[9px] mt-2 leading-tight">
            <p>Terima Kasih Atas Kunjungan Anda!</p>
            <p className="mt-0.5 font-bold">E-Receipt Digital:</p>
            <p className="text-[8px] break-all">
              justmine-tea-customer.vercel.app/receipt/{completedOrder.orderId}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
