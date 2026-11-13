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
  getItemOptionLines,
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
  // null = mode tambah baru; string = lineKey item yang sedang diedit
  const [editingLineKey, setEditingLineKey] = useState(null)

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

    // Bangun effective resolved: gabung resolved + toppingGroup jika fallback
    // agar buildSelectedOptions bisa menemukan topping yang dipilih
    const isFoodOrSweetsSave = isFoodCategory(customizingItem)
    const isNoToppingSave = isFoodOrSweetsSave || isSignatureCategory(customizingItem.category)
    const resolvedToppingGroup = !isNoToppingSave
      ? resolved.find((g) => g.id === 'topping' || g.id === 'topping_tea' || g.type === 'multi')
      : null

    // Jika toppingGroup tidak ada di resolved (bisa terjadi jika menu tidak punya optionGroupIds),
    // hitung toppingDelta manual dari fallback lalu tambahkan ke selectedOptions
    const fallbackToppingGroup = !isNoToppingSave && !resolvedToppingGroup
      ? {
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

    const effectiveTopping = resolvedToppingGroup || fallbackToppingGroup
    const selectedOptions = buildSelectedOptions(resolved, customSelection)

    // Tambah topping ke selectedOptions secara manual jika pakai fallback
    if (fallbackToppingGroup && Array.isArray(customSelection[fallbackToppingGroup.id])) {
      for (const tid of customSelection[fallbackToppingGroup.id]) {
        const c = fallbackToppingGroup.choices.find((ch) => ch.id === tid)
        if (c) {
          selectedOptions.push({
            groupId: 'topping',
            groupLabel: 'Topping Tambahan',
            choiceId: c.id,
            choiceLabel: c.label,
            priceDelta: c.priceDelta || 0,
          })
        }
      }
    }

    // Jika topping resolved, tapi choices berbeda dengan UI karena toppingGroup.id mismatch,
    // hitung topping delta dari effectiveTopping group
    const toppingDeltaForSave = effectiveTopping
      ? (customSelection[effectiveTopping.id] || []).reduce((sum, tid) => {
          const c = effectiveTopping.choices.find((ch) => ch.id === tid)
          return sum + (c?.priceDelta ?? 0)
        }, 0)
      : 0

    const basePrice = customizingItem.price || 0
    // Jika topping dari resolved group, computeUnitPrice sudah include topping via buildSelectedOptions
    // Jika topping dari fallback, kita hitung manual
    const unitPrice = resolvedToppingGroup
      ? computeUnitPrice(customizingItem, selectedOptions)
      : basePrice + toppingDeltaForSave

    const k = lineKey(customizingItem.id, selectedOptions)

    if (editingLineKey) {
      // Mode EDIT: replace item lama dengan yang baru
      setCart((prev) => {
        const filtered = prev.filter((p) => p.lineKey !== editingLineKey)
        const existIdx = filtered.findIndex((p) => p.lineKey === k)
        if (existIdx >= 0) {
          // merge qty jika pilihan baru sama dengan item lain yang sudah ada
          const next = [...filtered]
          next[existIdx] = { ...next[existIdx], qty: next[existIdx].qty + customQty }
          return next
        }
        return [
          ...filtered,
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
    } else {
      // Mode TAMBAH BARU
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
    }

    setCustomizingItem(null)
    setEditingLineKey(null)
  }

  function closeCustomizingModal() {
    setCustomizingItem(null)
    setEditingLineKey(null)
  }

  // Buka modal edit untuk item yang sudah di cart
  function handleEditCartItem(cartItem) {
    const menuItem = menuItems.find((m) => m.id === cartItem.id) || {
      id: cartItem.id,
      name: cartItem.name,
      price: cartItem.basePrice || cartItem.price,
      category: cartItem.category || '',
    }
    const resolved = resolveOptions(menuItem, optionGroups)

    // Rebuild selection dari selectedOptions yang tersimpan
    const restoredSelection = {}
    for (const g of resolved) {
      if (g.ui === 'note') {
        const noteOpt = cartItem.selectedOptions?.find((o) => o.groupId === g.id)
        restoredSelection[g.id] = noteOpt?.choiceLabel ?? ''
      } else {
        const picked = (cartItem.selectedOptions || [])
          .filter((o) => o.groupId === g.id)
          .map((o) => o.choiceId)
        restoredSelection[g.id] = picked.length > 0 ? picked : (normalizeSelection([g], {})[g.id] ?? [])
      }
    }

    setCustomizingItem(menuItem)
    setCustomSelection(restoredSelection)
    setCustomQty(cartItem.qty)
    setEditingLineKey(cartItem.lineKey)
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

    const finalCustomerName = selectedMember?.displayName || guestName.trim() || 'Guest'
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
      `Halo Kak *${order.customerName && order.customerName !== 'Pelanggan' ? order.customerName : 'Guest'}*! Terima kasih sudah mampir dan pesan di Justmine Tea.\n\n` +
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
    <div className="min-h-screen bg-[#FBFDFB] text-slate-800">
      {/* TopNav tersembunyi saat dicetak */}
      <div className="print:hidden">
        <TopNav />
      </div>

      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 print:hidden">
        {/* Banner Kasir Aktif */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#EAF5EE] flex items-center justify-center text-[#124734] shadow-2xs">
              <span className="material-symbols-outlined text-[26px]">point_of_sale</span>
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Kasir (Point of Sale)</h1>
              <p className="text-xs text-slate-500 mt-0.5">Pesanan langsung di counter · Kasir &amp; Takeaway</p>
            </div>
          </div>

          {/* Selector Tipe Pesanan */}
          <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80">
            <button
              onClick={() => setOrderType('dine_in')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                orderType === 'dine_in' ? 'bg-[#124734] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">restaurant</span>
              Dine-In
            </button>
            <button
              onClick={() => setOrderType('takeaway')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                orderType === 'takeaway' ? 'bg-[#124734] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">shopping_bag</span>
              Takeaway
            </button>
          </div>

          {/* Nomor Meja jika Dine In */}
          {orderType === 'dine_in' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Meja:</span>
              <input
                type="text"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                placeholder="No. Meja"
                className="w-20 px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-white text-center text-slate-900 focus:ring-1 focus:ring-[#124734]/20 focus:border-[#124734] focus:outline-none"
              />
              <div className="hidden sm:flex gap-1">
                {['1', '2', '3', '4', '5'].map((n) => (
                  <button
                    key={n}
                    onClick={() => setTableNumber(n)}
                    className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors ${
                      tableNumber === n
                        ? 'bg-[#124734] text-white shadow-2xs'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-[#EAF5EE] hover:text-[#124734]'
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ================= KOLOM KIRI: MENU KATALOG ================= */}
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-4">
            {/* Search & Category Tabs */}
            <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex flex-col gap-3.5">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-2.5 text-slate-400 text-[20px]">
                  search
                </span>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari menu teh, latte, topping..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs sm:text-sm border border-slate-200 bg-white placeholder:text-slate-400 text-slate-900 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20 transition-all"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700 text-xs font-bold"
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
                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                      activeCategory === cat
                        ? 'bg-[#124734] text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200/80 text-slate-600'
                    }`}
                  >
                    {CATEGORY_LABELS[cat] || cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Menu Grid */}
            {loading ? (
              <div className="bg-white rounded-3xl p-12 text-center text-slate-400 border border-slate-200/80 shadow-xs">
                <div className="w-8 h-8 rounded-full border-2 border-[#124734] border-t-transparent animate-spin mx-auto mb-3" />
                <p className="text-sm font-medium">Memuat menu Justmine Tea...</p>
              </div>
            ) : filteredMenu.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center text-slate-400 border border-dashed border-slate-200 shadow-xs">
                <span className="material-symbols-outlined text-[36px] mb-2 opacity-50">search_off</span>
                <p className="text-sm font-semibold">Tidak ada menu yang sesuai.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
                {filteredMenu.map((item) => {
                  const resolved = resolveOptions(item, optionGroups)
                  const isCustom = resolved.length > 0
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      role="button"
                      tabIndex={0}
                      className="group bg-white rounded-2xl p-3 border border-slate-200/80 hover:border-[#124734] hover:shadow-md transition-all cursor-pointer flex flex-col justify-between text-left select-none"
                    >
                      <div>
                        {/* Gambar / Placeholder */}
                        <div className="w-full aspect-[4/3] rounded-xl bg-[#F4F9F5] border border-slate-100 mb-2 overflow-hidden relative flex items-center justify-center">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                            />
                          ) : (
                            <span className="material-symbols-outlined text-emerald-700 text-3xl">local_cafe</span>
                          )}
                          {isCustom && (
                            <span className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded-md bg-[#124734]/90 text-white text-[10px] font-bold backdrop-blur-xs flex items-center gap-0.5 shadow-xs">
                              <span className="material-symbols-outlined text-[12px]">tune</span>
                              Kustom
                            </span>
                          )}
                        </div>

                        {/* Nama & Deskripsi */}
                        <h3 className="font-bold text-xs sm:text-sm text-slate-900 line-clamp-1 group-hover:text-[#124734] transition-colors">
                          {item.name}
                        </h3>
                        {item.desc && (
                          <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5 leading-snug">{item.desc}</p>
                        )}
                      </div>

                      {/* Harga & Tombol Tambah */}
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
                        <span className="font-extrabold text-xs sm:text-sm text-[#124734]">{rupiah(item.price)}</span>
                        <div className="w-7 h-7 rounded-full bg-[#EAF5EE] text-[#124734] group-hover:bg-[#124734] group-hover:text-white flex items-center justify-center transition-colors">
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
            {/* 1. TIPE LAYANAN & NOMOR MEJA */}
            <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px] text-[#124734]">table_restaurant</span>
                  Tipe Pesanan &amp; Meja
                </span>
                <span className="text-[11px] font-semibold text-slate-500">
                  {orderType === 'dine_in'
                    ? `Dine-In · ${tableNumber ? (tableNumber.toLowerCase().includes('meja') ? tableNumber : `Meja ${tableNumber}`) : 'Belum diisi'}`
                    : 'Takeaway'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOrderType('dine_in')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    orderType === 'dine_in'
                      ? 'bg-[#124734] text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">restaurant</span>
                  Dine-In
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType('takeaway')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    orderType === 'takeaway'
                      ? 'bg-[#124734] text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">shopping_bag</span>
                  Takeaway
                </button>
              </div>

              {orderType === 'dine_in' && (
                <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                  <label className="text-xs font-bold text-slate-700 shrink-0">No. Meja:</label>
                  <input
                    type="text"
                    value={tableNumber}
                    onChange={(e) => setTableNumber(e.target.value)}
                    placeholder="Contoh: 1, 2, Bar..."
                    className="flex-1 px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-900 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20"
                  />
                  <div className="flex gap-1 shrink-0">
                    {['1', '2', '3', '4', '5'].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setTableNumber(n)}
                        className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors ${
                          tableNumber === n
                            ? 'bg-[#124734] text-white shadow-2xs'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-[#EAF5EE] hover:text-[#124734]'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 2. KARTU MEMBER / LOYALTY */}
            <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <span className="material-symbols-outlined text-[#124734] text-[18px]">workspace_premium</span>
                  <span>Member Loyalty</span>
                </div>
                {selectedMember && (
                  <button
                    onClick={removeMember}
                    className="text-[11px] font-semibold text-red-600 hover:underline"
                  >
                    Ganti Member
                  </button>
                )}
              </div>

              {selectedMember ? (
                /* Member Terpilih */
                <div className="p-3 rounded-2xl bg-[#EAF5EE] border border-emerald-200/60 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[#124734] text-white font-bold flex items-center justify-center text-sm shrink-0">
                      {(selectedMember.displayName || 'M')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-slate-900 truncate">{selectedMember.displayName || 'Member'}</p>
                      <p className="text-[11px] text-slate-500">{selectedMember.phone || selectedMember.email || '—'}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-emerald-200 text-[#124734] font-bold text-xs">
                      ⭐ {selectedMember.points || 0}
                    </div>
                    <p className="text-[10px] text-[#124734] font-medium mt-0.5">+{Math.floor(total / 1000)} poin order ini</p>
                  </div>
                </div>
              ) : (
                /* Cari Member via No. WA / Nama */
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-2 text-slate-400 text-[18px]">
                      person_search
                    </span>
                    <input
                      type="text"
                      value={memberQuery}
                      onChange={(e) => setMemberQuery(e.target.value)}
                      placeholder="Cari No. WhatsApp / Nama member..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl text-xs border border-slate-200 bg-white placeholder:text-slate-400 text-slate-900 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20"
                    />
                    {memberLoading && (
                      <div className="absolute right-3 top-2.5 w-4 h-4 border-2 border-[#124734] border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>

                  {/* Dropdown hasil pencarian member */}
                  {foundMembers.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                      {foundMembers.map((m) => (
                        <div
                          key={m.uid}
                          onClick={() => selectMember(m)}
                          className="p-2.5 hover:bg-[#EAF5EE] cursor-pointer flex items-center justify-between transition-colors"
                        >
                          <div>
                            <p className="font-bold text-xs text-slate-900">{m.displayName || 'Member'}</p>
                            <p className="text-[11px] text-slate-500">{m.phone || m.email}</p>
                          </div>
                          <span className="text-[11px] font-bold text-[#124734]">⭐ {m.points || 0} Poin</span>
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
                      className="flex-1 px-3 py-1.5 rounded-xl text-xs border border-slate-200 bg-white placeholder:text-slate-400 text-slate-900 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20"
                    />
                    <input
                      type="tel"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      placeholder="No. WA Tamu (struk)"
                      className="flex-1 px-3 py-1.5 rounded-xl text-xs border border-slate-200 bg-white placeholder:text-slate-400 text-slate-900 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 3. DAFTAR KERANJANG KASIR */}
            <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-1.5 font-bold text-sm text-slate-900">
                  <span className="material-symbols-outlined text-[18px]">shopping_cart</span>
                  <span>Pesanan Kasir</span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#EAF5EE] text-[#124734]">
                    {cart.reduce((s, it) => s + it.qty, 0)} item
                  </span>
                </div>
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-xs text-slate-400 hover:text-red-600 font-semibold transition-colors"
                  >
                    Kosongkan
                  </button>
                )}
              </div>

              {/* List Items */}
              <div className="min-h-[160px] max-h-[300px] overflow-y-auto py-2 flex flex-col gap-2">
                {cart.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 flex flex-col items-center justify-center">
                    <span className="material-symbols-outlined text-[36px] opacity-40 mb-1">
                      remove_shopping_cart
                    </span>
                    <p className="text-xs font-bold text-slate-700">Keranjang masih kosong.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Klik menu di samping untuk menambahkan.</p>
                  </div>
                ) : (
                  cart.map((it) => {
                    const optionLines = getItemOptionLines(it)
                    return (
                      <div
                        key={it.lineKey}
                        className="p-3 rounded-2xl bg-[#FBFDFB] border border-slate-200/70 flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-xs text-slate-900">{it.name}</p>
                          {optionLines.length > 0 && (
                            <div className="mt-1 space-y-0.5 pl-2 border-l-2 border-[#124734]/40">
                              {optionLines.map((line, idx) => (
                                <p key={idx} className="text-[11px] text-slate-500 leading-tight">
                                  - {line}
                                </p>
                              ))}
                            </div>
                          )}
                          <p className="text-xs font-bold text-[#124734] mt-1.5">
                            {rupiah(it.price * it.qty)}
                            {it.qty > 1 && <span className="text-[10px] text-slate-400 ml-1">({rupiah(it.price)}/cup)</span>}
                          </p>
                        </div>

                        {/* Stepper Qty + Edit + Hapus */}
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-0.5 shadow-2xs">
                            <button
                              onClick={() => updateCartQty(it.lineKey, -1)}
                              className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-500 hover:bg-[#EAF5EE] hover:text-[#124734] text-xs font-bold"
                            >
                              -
                            </button>
                            <span className="w-5 text-center font-bold text-xs text-slate-900">{it.qty}</span>
                            <button
                              onClick={() => updateCartQty(it.lineKey, 1)}
                              className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-500 hover:bg-[#EAF5EE] hover:text-[#124734] text-xs font-bold"
                            >
                              +
                            </button>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleEditCartItem(it)}
                              title="Edit pilihan"
                              className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-[#124734] hover:bg-[#EAF5EE] text-xs transition-colors"
                            >
                              <span className="material-symbols-outlined text-[15px]">edit</span>
                            </button>
                            <button
                              onClick={() => removeFromCart(it.lineKey)}
                              title="Hapus"
                              className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 text-xs transition-colors"
                            >
                              <span className="material-symbols-outlined text-[15px]">delete</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Rincian Total */}
              <div className="border-t border-slate-100 pt-3 mt-1 flex flex-col gap-1.5">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Subtotal</span>
                  <span className="font-semibold text-slate-800">{rupiah(subtotal)}</span>
                </div>
                <div className="flex justify-between items-baseline font-extrabold text-base text-slate-900">
                  <span>Total Tagihan</span>
                  <span className="text-lg font-black text-[#124734]">{rupiah(total)}</span>
                </div>
              </div>
            </div>

            {/* 4. METODE PEMBAYARAN & HITUNG KEMBALIAN */}
            <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs flex flex-col gap-3">
              <span className="text-xs font-bold text-slate-900">Pilih Metode Pembayaran:</span>

              {/* Tabs Metode Bayar */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'cash', label: 'Tunai (Cash)', icon: 'payments' },
                  { key: 'qris', label: 'QRIS Kasir', icon: 'qr_code_scanner' },
                  { key: 'debit', label: 'Debit / EDC', icon: 'credit_card' },
                ].map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setPaymentMethod(m.key)}
                    className={`p-2.5 rounded-2xl text-xs font-bold flex flex-col items-center gap-1 border transition-all ${
                      paymentMethod === m.key
                        ? 'bg-[#124734] text-white border-transparent shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-[#EAF5EE] hover:text-[#124734]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px]">{m.icon}</span>
                    <span className="text-[11px]">{m.label}</span>
                  </button>
                ))}
              </div>

              {/* Bagian Uang Tunai & Kembalian */}
              {paymentMethod === 'cash' && (
                <div className="p-3 rounded-2xl bg-[#FBFDFB] border border-slate-200/80 flex flex-col gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Uang Diterima dari Pelanggan:
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">Rp</span>
                      <input
                        type="number"
                        value={cashTendered}
                        onChange={(e) => setCashTendered(e.target.value)}
                        placeholder="0"
                        className="w-full pl-9 pr-3 py-1.5 rounded-xl text-sm font-bold border border-slate-200 bg-white text-slate-900 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20"
                      />
                    </div>
                  </div>

                  {/* Tombol Shortcut Uang Cepat */}
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setQuickCash(total)}
                      className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-white border border-slate-200 text-slate-700 hover:bg-[#EAF5EE] hover:text-[#124734]"
                    >
                      Uang Pas
                    </button>
                    {[20000, 50000, 100000].map((nominal) => (
                      <button
                        key={nominal}
                        onClick={() => setQuickCash(nominal)}
                        className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-white border border-slate-200 text-slate-700 hover:bg-[#EAF5EE] hover:text-[#124734]"
                      >
                        {rupiah(nominal)}
                      </button>
                    ))}
                  </div>

                  {/* Banner Kembalian */}
                  {cashNum > 0 && (
                    <div
                      className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-bold ${
                        cashNum >= total
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-amber-50 border-amber-200 text-amber-800'
                      }`}
                    >
                      <span>{cashNum >= total ? 'Kembalian:' : 'Uang Kurang:'}</span>
                      <span className="text-sm font-extrabold">
                        {cashNum >= total ? rupiah(change) : rupiah(total - cashNum)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {paymentMethod === 'qris' && (
                <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-blue-600 shrink-0">info</span>
                  <span>Arahkan pelanggan scan kode QRIS statis / EDC di meja kasir.</span>
                </div>
              )}

              {paymentMethod === 'debit' && (
                <div className="p-3 rounded-2xl bg-purple-50 border border-purple-200 text-purple-900 text-xs flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-purple-600 shrink-0">credit_card</span>
                  <span>Proses pembayaran melalui mesin EDC bank di meja kasir.</span>
                </div>
              )}

              {/* Tombol Selesaikan Transaksi */}
              <button
                onClick={handleCheckout}
                disabled={cart.length === 0 || !isCashSufficient || submitting}
                className="w-full py-3.5 rounded-2xl bg-[#124734] hover:bg-[#0c3124] disabled:bg-slate-300 text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2 mt-1"
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
                { id: 'normal', label: 'Normal Sugar', priceDelta: 0 },
                { id: 'less', label: 'Less Sugar', priceDelta: 0 },
                { id: 'no', label: 'No Sugar', priceDelta: 0 },
              ],
            }
          : null

        const iceGroup = !isFoodOrSweets
          ? resolved.find((g) => g.id === 'es') || {
              id: 'es',
              label: 'Tingkat Es Batu',
              choices: [
                { id: 'normal', label: 'Normal Ice', priceDelta: 0 },
                { id: 'less', label: 'Less Ice', priceDelta: 0 },
                { id: 'no', label: 'No Ice', priceDelta: 0 },
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
        // Hitung harga: base price + topping delta (dari toppingGroup.choices yang sudah terresolved)
        // Tidak pakai buildSelectedOptions/computeUnitPrice karena bisa tidak sinkron dengan toppingGroup fallback
        const modalUnitPrice = basePrice + toppingDelta
        const modalGrandTotal = modalUnitPrice * customQty

        return (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
            {/* Backdrop click to close */}
            <div className="fixed inset-0" onClick={closeCustomizingModal} aria-hidden="true" />

            {/* Container */}
            <div className="relative z-10 w-full sm:max-w-4xl bg-white text-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[88vh] border border-slate-100 animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-250">
              {/* Drag Handle (Mobile Only) */}
              <div className="sm:hidden w-full flex items-center justify-center pt-3 pb-1">
                <div className="w-12 h-1.5 rounded-full bg-slate-200" />
              </div>

              {/* Header Modal */}
              <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white/95 backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={closeCustomizingModal}
                    aria-label="Kembali"
                    className="w-9 h-9 rounded-full flex items-center justify-center text-slate-700 hover:bg-[#EAF5EE] hover:text-[#124734] active:scale-95 transition-all -ml-1"
                  >
                    <span className="material-symbols-outlined text-[22px]">arrow_back</span>
                  </button>
                  <div className="flex flex-col">
                    <span className="text-[10px] sm:text-xs font-bold tracking-wider text-[#124734] uppercase">
                      Justmine Tea — Kasir POS
                    </span>
                    <h2 className="text-sm sm:text-base font-extrabold text-slate-900 leading-tight">
                      {editingLineKey ? 'Edit Pesanan' : isFoodOrSweets ? 'Catatan & Kustom Makanan' : 'Kustomisasi Minuman'}
                    </h2>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeCustomizingModal}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {/* Content Body: Split 2 Kolom di Desktop, Stack di Mobile */}
              <div className="overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 pb-28">
                {/* ================= KIRI: DETAIL PRODUK & FOTO ================= */}
                <div className="lg:col-span-5 flex flex-col gap-3 min-w-0">
                  <div className="relative w-full aspect-[4/3] rounded-2xl sm:rounded-3xl overflow-hidden shadow-xs bg-[#F4F9F5] border border-slate-100 flex items-center justify-center">
                    {customizingItem.imageUrl ? (
                      <img
                        src={customizingItem.imageUrl}
                        alt={customizingItem.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="material-symbols-outlined text-emerald-700 text-5xl">local_cafe</span>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

                    <div className="absolute top-3 left-3 flex items-center gap-1.5">
                      <span className="px-2.5 py-1 rounded-full bg-[#124734] text-white text-[11px] font-bold shadow-xs capitalize">
                        {customizingItem.category ? `${customizingItem.category}` : 'Menu Spesial'}
                      </span>
                    </div>

                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white text-[11px] font-medium">
                      <span className="flex items-center gap-1 bg-black/40 backdrop-blur-xs px-2.5 py-1 rounded-full">
                        <span className="material-symbols-outlined text-[15px] text-emerald-300">eco</span>
                        Pilihan Kasir
                      </span>
                      <span className="flex items-center gap-1 bg-black/40 backdrop-blur-xs px-2.5 py-1 rounded-full">
                        <span className="material-symbols-outlined text-[15px] text-amber-300">verified</span>
                        Bisa Kustom
                      </span>
                    </div>
                  </div>

                  {/* Detail Info Card */}
                  <div className="bg-white rounded-2xl p-4 border border-slate-200/80 flex flex-col gap-1.5 shadow-2xs min-w-0 overflow-hidden">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight break-words">
                            {customizingItem.name}
                          </h3>
                          {editingLineKey && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200">
                              <span className="material-symbols-outlined text-[12px]">edit</span>
                              Edit Pesanan
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#124734] font-semibold mt-0.5">
                          Kategori: {customizingItem.category || 'Teh Nusantara'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-lg sm:text-xl font-black text-[#124734] block">
                          {rupiah(basePrice)}
                        </span>
                        <span className="text-[10px] text-slate-400">Harga Dasar</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 leading-relaxed mt-1 break-words">
                      {customizingItem.desc || 'Seduhan artisan daun teh alami dengan racikan segar pilihan.'}
                    </p>

                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 mt-1">
                      {!isFoodOrSweets && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#EAF5EE] text-[#124734] text-[11px] font-bold">
                          <span className="material-symbols-outlined text-[13px]">ac_unit</span>
                          Iced Drink
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium">
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
                    <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-[#124734] text-white text-[11px] flex items-center justify-center font-bold">
                            1
                          </span>
                          <h4 className="font-extrabold text-sm text-slate-900">{sugarGroup.label}</h4>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-[#EAF5EE] text-[#124734] text-[10px] font-bold">
                          WAJIB
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">Pilih takaran kemanisan teh dari customer:</p>

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
                                  ? 'bg-[#124734] text-white border-[#124734] shadow-xs'
                                  : 'bg-white text-slate-800 border-slate-200 hover:border-[#124734]'
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
                    <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-[#124734] text-white text-[11px] flex items-center justify-center font-bold">
                            2
                          </span>
                          <h4 className="font-extrabold text-sm text-slate-900">{iceGroup.label}</h4>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-[#EAF5EE] text-[#124734] text-[10px] font-bold">
                          WAJIB
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">Pilih kadar dingin es batu:</p>

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
                                  ? 'bg-[#124734] text-white border-[#124734] shadow-xs'
                                  : 'bg-white text-slate-800 border-slate-200 hover:border-[#124734]'
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
                    <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-[#124734] text-white text-[11px] flex items-center justify-center font-bold">
                            3
                          </span>
                          <h4 className="font-extrabold text-sm text-slate-900">{toppingGroup.label}</h4>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold">
                          BISA PILIH LEBIH DARI SATU
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">Pilihan topping lezat Justmine Tea:</p>

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
                              className={`w-full p-2.5 rounded-xl border transition-all flex items-center justify-between text-left shadow-2xs ${
                                picked
                                  ? 'bg-[#EAF5EE] border-[#124734]'
                                  : 'bg-white border-slate-200 hover:border-[#124734]'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                    picked ? 'bg-[#124734] text-white' : 'bg-slate-100 text-slate-800'
                                  }`}
                                >
                                  <span className="material-symbols-outlined text-[18px]">{icon}</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-xs font-bold text-slate-900">{c.label}</span>
                                  <span className="text-[11px] font-bold text-[#124734]">
                                    +{rupiah(c.priceDelta)}
                                  </span>
                                </div>
                              </div>

                              <div
                                className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                                  picked
                                    ? 'bg-[#124734] border-[#124734] text-white'
                                    : 'border-slate-300 text-transparent'
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
                      <div key={g.id} className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex flex-col gap-2.5">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-900">{g.label}</span>
                          {g.required && <span className="text-[10px] text-red-500 font-bold">*Wajib</span>}
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
                                    ? 'bg-[#124734] text-white border-transparent shadow-xs'
                                    : 'bg-white border-slate-200 text-slate-700 hover:border-[#124734]'
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
                  <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[11px] flex items-center justify-center font-bold">
                          {isFoodOrSweets ? '1' : toppingGroup ? '4' : '3'}
                        </span>
                        <h4 className="font-extrabold text-sm text-slate-900">
                          {isFoodOrSweets ? 'Catatan Pesanan Dapur' : 'Catatan Khusus untuk Barista'}
                        </h4>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">Maks. 80 Karakter</span>
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
                      className="w-full bg-white text-slate-900 rounded-xl px-3.5 py-2.5 text-xs placeholder:text-slate-400 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20 border border-slate-200 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* ================= BOTTOM ACTION BAR (STICKY) ================= */}
              <div className="sticky bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur-xl border-t border-slate-100 px-4 py-3 sm:px-6 sm:py-3.5 shadow-lg flex items-center justify-between gap-3">
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[#124734]">
                    Subtotal Item
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                      {rupiah(modalGrandTotal)}
                    </span>
                  </div>
                  {/* Stepper Qty */}
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setCustomQty((q) => Math.max(1, q - 1))}
                      className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-800 active:scale-95 transition-all text-xs font-bold"
                    >
                      -
                    </button>
                    <span className="text-xs font-bold text-slate-900 w-4 text-center">{customQty}</span>
                    <button
                      type="button"
                      onClick={() => setCustomQty((q) => Math.min(20, q + 1))}
                      className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-800 active:scale-95 transition-all text-xs font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Tombol Simpan ke Keranjang Kasir */}
                <button
                  type="button"
                  onClick={handleAddCustomizedToCart}
                  className="flex-1 py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm text-white bg-[#124734] hover:bg-[#0c3124] active:scale-[0.98] shadow-md transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {editingLineKey ? 'check_circle' : 'shopping_cart'}
                  </span>
                  <span className="truncate">
                    {editingLineKey ? `Simpan Perubahan • ${rupiah(modalGrandTotal)}` : `Tambah ke Pesanan Kasir • ${rupiah(modalGrandTotal)}`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ================= MODAL TRANSAKSI BERHASIL & STRUK ================= */}
      {completedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 print:hidden overflow-y-auto">
          <div className="bg-white border border-slate-100 rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
            {/* Header Modal */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-[#EAF5EE] text-[#124734] flex items-center justify-center shadow-2xs">
                  <span className="material-symbols-outlined text-[24px]">check_circle</span>
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-black text-slate-900 leading-tight">Transaksi Berhasil!</h2>
                  <p className="text-[11px] text-slate-500">Pesanan masuk antrean · #{completedOrder.orderCode}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleNewTransaction}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                title="Tutup & Transaksi Baru"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Area Pratinjau Struk Thermal (Identik Customer E-Receipt ala Fore Coffee) */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-neutral-100 flex justify-center">
              <div className="w-full max-w-[340px] bg-white border border-neutral-300 rounded-xl shadow-md p-4 font-mono text-neutral-900 leading-tight text-[11px]">
                {/* Brand & Outlet Header */}
                <div className="text-center pb-2">
                  <img
                    src="/icon.png"
                    alt="Justmine Tea Logo"
                    className="w-12 h-12 mx-auto object-contain rounded-full border border-neutral-200 mb-1.5 bg-white"
                  />
                  <h3 className="font-extrabold text-sm tracking-[0.2em] text-black uppercase">
                    JUSTMINE TEA
                  </h3>
                  <p className="text-[8.5px] tracking-[0.16em] font-semibold text-neutral-600 uppercase mt-0.5">
                    ARTISANAL BOTANICAL INFUSION
                  </p>
                  <div className="text-[9.5px] text-neutral-600 mt-1.5 space-y-0.5 leading-snug">
                    <p>Justmine Tea Atelier - Outlet Pamulang</p>
                    <p>Jl. Surya Kencana No. 1, Pamulang Barat</p>
                    <p>TANGERANG SELATAN, BANTEN</p>
                    <p>TEL : (021) 7412-889</p>
                  </div>
                </div>

                {/* Table / Takeaway Banner */}
                <div className="py-2 text-center border-t border-dashed border-neutral-400 my-1">
                  <span className="text-lg font-black tracking-widest text-black">
                    {completedOrder.tableNumber && !completedOrder.tableNumber.toLowerCase().includes('take')
                      ? `TABLE - ${String(completedOrder.tableNumber).replace(/\D/g, '').padStart(2, '0') || completedOrder.tableNumber}`
                      : 'TAKE-AWAY'}
                  </span>
                </div>

                {/* Metadata */}
                <div className="border-t border-dashed border-neutral-400 py-2 space-y-1 text-[10.5px]">
                  <div className="flex justify-between items-center">
                    <span className="font-bold">ID Pesanan :</span>
                    <span className="font-extrabold tracking-wider text-black">#{completedOrder.orderCode}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Date       :</span>
                    <span>
                      {new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      &nbsp;
                      {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Kasir      :</span>
                    <div className="flex items-center gap-2">
                      <span>{completedOrder.cashierName || 'Kasir'}</span>
                      <span className="font-bold text-[10px] uppercase">
                        {completedOrder.tableNumber && !completedOrder.tableNumber.toLowerCase().includes('take') ? 'DINE-IN' : 'TAKE-AWAY'}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Atas Nama  :</span>
                    <span className="font-bold">
                      {completedOrder.customerName && completedOrder.customerName !== 'Pelanggan' ? completedOrder.customerName : 'Guest'}
                    </span>
                  </div>
                </div>

                {/* Order Header */}
                <div className="border-t border-dashed border-neutral-400 pt-2 pb-1 flex justify-between items-center text-xs font-bold text-black">
                  <span>Order</span>
                  <span>Total Order: {(completedOrder.items || []).reduce((s, it) => s + (it.qty || 1), 0)}</span>
                </div>

                {/* Item List */}
                <div className="border-b border-dashed border-neutral-400 pb-2 space-y-1.5 text-[10.5px]">
                  {(completedOrder.items || []).map((item, idx) => {
                    const lineTotal = (item.price || 0) * (item.qty || 1)
                    const optionLines = getItemOptionLines(item)
                    return (
                      <div key={idx} className="space-y-0.5">
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex items-start gap-1.5 min-w-0">
                            <span className="font-bold shrink-0">{item.qty} x</span>
                            <span className="font-bold text-black uppercase leading-tight">{item.name}</span>
                          </div>
                          <span className="font-bold shrink-0 text-black">
                            Rp {lineTotal.toLocaleString('id-ID')}
                          </span>
                        </div>
                        {optionLines.length > 0 && (
                          <div className="pl-5 space-y-0.5 text-[10px] text-neutral-700 font-mono">
                            {optionLines.map((line, lIdx) => (
                              <p key={lIdx} className="leading-tight">
                                - {line}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Financial Summary */}
                {(() => {
                  const orderTotal = Number(completedOrder.total || 0)
                  const discount = Number(completedOrder.discount || 0)
                  const finalSubtotal = Math.max(0, orderTotal - discount)
                  const netSales = Math.round(finalSubtotal / 1.11)
                  const ppnAmount = finalSubtotal - netSales
                  const isCash = (completedOrder.paymentMethod || '').toLowerCase().includes('tunai')
                  return (
                    <div className="py-2 space-y-1 text-[10.5px] border-b border-dashed border-neutral-400">
                      <div className="flex justify-between">
                        <span>Total Inc Tax</span>
                        <span>Rp {orderTotal.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="flex justify-between text-neutral-600">
                        <span>Voucher Discount</span>
                        <span>Rp {discount.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="flex justify-between font-bold text-black pt-0.5">
                        <span>SUBTOTAL</span>
                        <span>Rp {finalSubtotal.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="flex justify-between text-neutral-600 pt-1 border-t border-dotted border-neutral-300">
                        <span>Net Sales</span>
                        <span>Rp {netSales.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="flex justify-between text-neutral-600">
                        <span>PPN 11%</span>
                        <span>Rp {ppnAmount.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="flex justify-between items-center font-bold text-black pt-1 border-t border-dotted border-neutral-300">
                        <span>{completedOrder.paymentMethod}</span>
                        <span>Rp {finalSubtotal.toLocaleString('id-ID')}</span>
                      </div>
                      {isCash && completedOrder.cashTendered != null && (
                        <div className="flex justify-between text-neutral-700">
                          <span>Tunai Diterima</span>
                          <span>Rp {Number(completedOrder.cashTendered).toLocaleString('id-ID')}</span>
                        </div>
                      )}
                      {isCash && completedOrder.change != null && (
                        <div className="flex justify-between font-bold text-black">
                          <span>KEMBALIAN</span>
                          <span>Rp {Number(completedOrder.change).toLocaleString('id-ID')}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center pt-1">
                        <span>Status</span>
                        <span className="px-1.5 py-0.5 text-[9.5px] font-extrabold tracking-wider border border-black text-black bg-neutral-100">
                          LUNAS / PAID
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[9.5px] text-neutral-500 font-mono">
                        <span>Ref Transaksi:</span>
                        <span>TRX-JM-{completedOrder.orderCode}</span>
                      </div>
                    </div>
                  )
                })()}

                {/* Loyalty Point */}
                <div className="py-2 text-center space-y-0.5 border-b border-dashed border-neutral-400">
                  <p className="text-[10px] font-bold text-black">
                    Dapatkan {completedOrder.pointsEarned ?? Math.floor(completedOrder.total / 1000)} Poin Melati untuk transaksi ini!
                  </p>
                  {completedOrder.pointsEarned > 0 && completedOrder.currentPoints != null && (
                    <p className="text-[9.5px] text-neutral-600">
                      Total Poin Member: <span className="font-bold">{completedOrder.currentPoints} Poin</span>
                    </p>
                  )}
                  <p className="text-[9px] text-neutral-600 italic">
                    Tunjukkan struk digital ini ke Barista untuk klaim poin member.
                  </p>
                </div>

                {/* Footer */}
                <div className="pt-2 text-center space-y-0.5">
                  <h4 className="font-bold text-xs tracking-wide text-black uppercase">
                    Terima kasih
                  </h4>
                  <p className="text-[9.5px] italic font-serif text-neutral-800">
                    &lsquo;Nikmati jeda teh terbaik Anda bersama Justmine Tea&rsquo;
                  </p>
                  <p className="text-[8px] tracking-widest text-neutral-400 uppercase pt-1">
                    MADE FROM AUTHENTIC BOTANICAL HARVEST
                  </p>
                </div>
              </div>
            </div>

            {/* Tombol Aksi Bawah */}
            <div className="p-3 sm:p-4 bg-white border-t border-slate-100 flex flex-col gap-2 shrink-0">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="py-2.5 px-3 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                >
                  <span className="material-symbols-outlined text-[18px]">print</span>
                  <span>Cetak Struk (Thermal)</span>
                </button>
                <button
                  type="button"
                  onClick={() => sendWhatsAppReceipt(completedOrder)}
                  className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                >
                  <span className="material-symbols-outlined text-[18px]">chat</span>
                  <span>Kirim WhatsApp</span>
                </button>
              </div>
              <button
                type="button"
                onClick={handleNewTransaction}
                className="w-full py-2.5 px-4 rounded-xl bg-[#124734] hover:bg-[#0c3124] text-white font-black text-xs sm:text-sm shadow-md transition-colors flex items-center justify-center gap-1.5"
              >
                <span>Transaksi Baru</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAMPILAN CETAK STRUK THERMAL (PRINT ONLY) ================= */}
      {completedOrder && (() => {
        const orderItems = completedOrder.items || []
        const totalQty = orderItems.reduce((s, it) => s + (it.qty || 1), 0)
        const orderTotal = Number(completedOrder.total || 0)
        const discount = Number(completedOrder.discount || 0)
        const finalSubtotal = Math.max(0, orderTotal - discount)
        const netSales = Math.round(finalSubtotal / 1.11)
        const ppnAmount = finalSubtotal - netSales
        const isCash = (completedOrder.paymentMethod || '').toLowerCase().includes('tunai')

        return (
          <div className="hidden print:block font-mono text-neutral-900 leading-tight bg-white p-0 max-w-none w-[78mm]">
            {/* Logo & Identitas Brand */}
            <div className="text-center pb-2">
              <img
                src="/icon.png"
                alt="Justmine Tea Logo"
                className="w-14 h-14 mx-auto object-contain rounded-full border border-neutral-300 mb-2 bg-white"
              />
              <h2 className="font-extrabold text-base tracking-[0.22em] text-black uppercase">
                JUSTMINE TEA
              </h2>
              <p className="text-[9px] tracking-[0.18em] font-semibold text-neutral-700 uppercase mt-0.5">
                ARTISANAL BOTANICAL INFUSION
              </p>
              <div className="text-[10px] text-neutral-600 mt-2 space-y-0.5 leading-snug">
                <p>Justmine Tea Atelier - Outlet Pamulang</p>
                <p>Jl. Surya Kencana No. 1, Pamulang Barat</p>
                <p>TANGERANG SELATAN, BANTEN</p>
                <p>TEL : (021) 7412-889</p>
              </div>
            </div>

            {/* Nomor Meja / Tipe Pesanan */}
            <div className="py-2.5 text-center border-t border-dashed border-neutral-400 my-1">
              <span className="text-xl font-black tracking-widest text-black">
                {completedOrder.tableNumber && !completedOrder.tableNumber.toLowerCase().includes('take')
                  ? `TABLE - ${String(completedOrder.tableNumber).replace(/\D/g, '').padStart(2, '0') || completedOrder.tableNumber}`
                  : 'TAKE-AWAY'}
              </span>
            </div>

            {/* Header Metadata */}
            <div className="border-t border-dashed border-neutral-400 py-2 space-y-1 text-[11px]">
              <div className="flex justify-between items-center">
                <span className="font-bold">ID Pesanan :</span>
                <span className="font-extrabold tracking-wider text-black">#{completedOrder.orderCode}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Date       :</span>
                <span>
                  {new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  &nbsp;
                  {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Kasir      :</span>
                <div className="flex items-center gap-2">
                  <span>{completedOrder.cashierName || 'Kasir'}</span>
                  <span className="font-bold text-[10px] uppercase">
                    {completedOrder.tableNumber && !completedOrder.tableNumber.toLowerCase().includes('take') ? 'DINE-IN' : 'TAKE-AWAY'}
                  </span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span>Atas Nama  :</span>
                <span className="font-bold">
                  {completedOrder.customerName && completedOrder.customerName !== 'Pelanggan' ? completedOrder.customerName : 'Guest'}
                </span>
              </div>
            </div>

            {/* Header Order ala Fore Coffee */}
            <div className="border-t border-dashed border-neutral-400 pt-2.5 pb-1 flex justify-between items-center text-xs font-bold text-black">
              <span>Order</span>
              <span>Total Order: {totalQty}</span>
            </div>

            {/* Daftar Item Pesanan & Kustomisasi Vertikal */}
            <div className="border-b border-dashed border-neutral-400 pb-2.5 space-y-2 text-[11px]">
              {orderItems.map((item, idx) => {
                const lineTotal = (item.price || 0) * (item.qty || 1)
                const optionLines = getItemOptionLines(item)
                return (
                  <div key={idx} className="space-y-0.5">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="font-bold shrink-0">{item.qty} x</span>
                        <span className="font-bold text-black uppercase">{item.name}</span>
                      </div>
                      <span className="font-bold shrink-0 text-black">
                        Rp {lineTotal.toLocaleString('id-ID')}
                      </span>
                    </div>
                    {optionLines.length > 0 && (
                      <div className="pl-6 space-y-0.5 text-[10.5px] text-neutral-700 font-mono">
                        {optionLines.map((line, lIdx) => (
                          <p key={lIdx} className="leading-tight">
                            - {line}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Rincian Finansial, Pajak PB1 & TOTAL (Fore Coffee Style) */}
            <div className="py-2.5 space-y-1 text-[11px] border-b border-dashed border-neutral-400">
              <div className="flex justify-between">
                <span>Total Inc Tax</span>
                <span>Rp {orderTotal.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Voucher Discount</span>
                <span>Rp {discount.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between font-bold text-black pt-0.5">
                <span>SUBTOTAL</span>
                <span>Rp {finalSubtotal.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between text-neutral-600 pt-1 border-t border-dotted border-neutral-300">
                <span>Net Sales</span>
                <span>Rp {netSales.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>PPN 11%</span>
                <span>Rp {ppnAmount.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between items-center font-bold text-black pt-1 border-t border-dotted border-neutral-300">
                <span>{completedOrder.paymentMethod}</span>
                <span>Rp {finalSubtotal.toLocaleString('id-ID')}</span>
              </div>
              {isCash && completedOrder.cashTendered != null && (
                <div className="flex justify-between text-neutral-700">
                  <span>Tunai Diterima</span>
                  <span>Rp {Number(completedOrder.cashTendered).toLocaleString('id-ID')}</span>
                </div>
              )}
              {isCash && completedOrder.change != null && (
                <div className="flex justify-between font-bold text-black">
                  <span>KEMBALIAN</span>
                  <span>Rp {Number(completedOrder.change).toLocaleString('id-ID')}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-1">
                <span>Status</span>
                <span className="px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider border border-black text-black bg-neutral-100">
                  LUNAS / PAID
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px] text-neutral-500 font-mono">
                <span>Ref Transaksi:</span>
                <span>TRX-JM-{completedOrder.orderCode}</span>
              </div>
            </div>

            {/* Poin Loyalty */}
            <div className="py-2.5 text-center space-y-1 border-b border-dashed border-neutral-400">
              <p className="text-[11px] font-bold text-black">
                Dapatkan {completedOrder.pointsEarned ?? Math.floor(finalSubtotal / 1000)} Poin Melati untuk transaksi ini!
              </p>
              {completedOrder.pointsEarned > 0 && completedOrder.currentPoints != null && (
                <p className="text-[10px] text-neutral-600">
                  Total Poin Member: <span className="font-bold">{completedOrder.currentPoints} Poin</span>
                </p>
              )}
              <p className="text-[9.5px] text-neutral-600 leading-tight italic">
                Tunjukkan struk digital ini ke Barista untuk klaim poin member.
              </p>
            </div>

            {/* Footer Ucapan Terima Kasih (Fore Coffee Style) */}
            <div className="pt-3 pb-1 text-center space-y-1">
              <h3 className="font-bold text-sm tracking-wide text-black uppercase">
                Terima kasih
              </h3>
              <p className="text-[10px] italic font-serif text-neutral-800">
                &lsquo;Nikmati jeda teh terbaik Anda bersama Justmine Tea&rsquo;
              </p>
              <p className="text-[10px] font-bold text-neutral-700 mt-1">E-Receipt Digital:</p>
              <p className="text-[8px] break-all text-neutral-600">
                justmine-tea-customer.vercel.app/receipt/{completedOrder.orderId}
              </p>
              <p className="text-[8px] tracking-widest text-neutral-400 uppercase pt-2">
                POS VERSION 4.2.1 • CLOUD SYNCED
              </p>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
