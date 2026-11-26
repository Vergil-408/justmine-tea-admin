import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  listenToMenuItemsAdmin,
  addMenuItem,
  updateMenuItem,
  deleteMenuItem,
  importSeed,
} from '../api/menu.js'
import { seedMenuItems } from '../data/seedMenu.js'
import { seedOptionGroups } from '../data/seedOptionGroups.js'
import { getBasePrice, isFoodCategory } from '../utils/options.js'
import { compressImage, formatKB } from '../utils/image.js'
import TopNav from '../components/TopNav.jsx'

const emptyForm = {
  name: '',
  desc: '',
  itemType: 'drink', // 'drink' | 'food'
  category: 'Minuman',
  subcategory: '',
  price: '',
  tag: '',
  inStock: true,
  allowSugar: true,
  allowIce: true,
  allowTopping: true,
  allowNote: true,
  imageUrl: null,
}

function rupiah(n) {
  return `Rp${Number(n || 0).toLocaleString('id-ID')}`
}

const DRINK_CATEGORIES = [
  'Minuman',
  'Signature Tea',
  'Tropical',
  'Classic Tea',
  'Fruit Tea',
  'Milk Tea',
  'Coffee Series',
  'Paket Promo',
]

const FOOD_CATEGORIES = [
  'Makanan',
  'Main Course',
  'Snacks',
  'Dessert',
  'Pastry & Bakery',
  'Paket Promo',
  'Combo',
]

const SUBCATEGORIES = {
  'Minuman': ['Tea Series', 'Milk Tea', 'Fruit Tea', 'Coffee', 'Signature'],
  'Signature Tea': ['Original', 'Lychee', 'Jasmine', 'Matcha', 'Oolong'],
  'Tropical': ['Mangga', 'Nanas', 'Passion Fruit', 'Coconut'],
  'Classic Tea': ['Green Tea', 'Black Tea', 'Chamomile', 'Earl Grey'],
  'Fruit Tea': ['Lemon', 'Strawberry', 'Peach', 'Watermelon'],
  'Milk Tea': ['Brown Sugar', 'Taro', 'Thai Tea', 'Oat Milk'],
  'Coffee Series': ['Americano', 'Latte', 'Cappuccino', 'Cold Brew'],
  'Makanan': ['Main Course', 'Snack Gurih', 'Snack Manis', 'Pastry'],
  'Main Course': ['Nasi', 'Mie', 'Pasta'],
  'Snacks': ['Goreng', 'Bakar', 'Rebus'],
  'Dessert': ['Ice Cream', 'Pudding', 'Cake'],
  'Pastry & Bakery': ['Roti', 'Croissant', 'Muffin'],
  'Paket Promo': [],
  'Combo': [],
}

export default function MenuAdmin() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [imageChanged, setImageChanged] = useState(false)
  const [imageInfo, setImageInfo] = useState('')
  const [imageBusy, setImageBusy] = useState(false)

  // Filter & Search & Pagination Tabel
  const [filterType, setFilterType] = useState('all') // 'all' | 'drink' | 'food'
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [activeMenuActionId, setActiveMenuActionId] = useState(null)
  const pageSize = 6

  useEffect(() => {
    const unsub = listenToMenuItemsAdmin((data) => {
      setItems(data.sort((a, b) => (a.name || '').localeCompare(b.name || '')))
      setLoading(false)
    })
    return unsub
  }, [])

  // Pisahkan hitungan drink vs food
  const drinkCount = useMemo(() => items.filter((i) => !isFoodCategory(i)).length, [items])
  const foodCount = useMemo(() => items.filter((i) => isFoodCategory(i)).length, [items])

  // Filter daftar menu berdasarkan filterType dan search
  const filteredItems = useMemo(() => {
    let result = items
    if (filterType === 'drink') result = result.filter((i) => !isFoodCategory(i))
    else if (filterType === 'food') result = result.filter((i) => isFoodCategory(i))

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter((i) =>
        (i.name || '').toLowerCase().includes(q) ||
        (i.category || '').toLowerCase().includes(q) ||
        (i.desc || '').toLowerCase().includes(q)
      )
    }
    return result
  }, [items, filterType, searchQuery])

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / pageSize) || 1
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredItems.slice(start, start + pageSize)
  }, [filteredItems, currentPage, pageSize])

  // Saran kategori dinamis sesuai jenis menu
  const suggestedCategories = useMemo(() => {
    const defaults = form.itemType === 'food' ? FOOD_CATEGORIES : DRINK_CATEGORIES
    const existing = items
      .filter((i) => (form.itemType === 'food' ? isFoodCategory(i) : !isFoodCategory(i)))
      .map((i) => (i.category || '').trim())
      .filter(Boolean)
    return Array.from(new Set([...defaults, ...existing]))
  }, [form.itemType, items])

  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
    setImageChanged(false)
    setImageInfo('')
  }

  async function handlePickImage(e) {
    const file = e.target?.files?.[0] || e
    if (e.target) e.target.value = ''
    if (!file) return
    setImageBusy(true)
    try {
      const r = await compressImage(file)
      setForm((f) => ({ ...f, imageUrl: r.dataUrl }))
      setImageChanged(true)
      setImageInfo(`${r.mime === 'image/webp' ? 'WebP' : 'JPEG'} ${r.width}×${r.height} · ${formatKB(r.bytes)}`)
    } catch (err) {
      alert(err.message)
    } finally {
      setImageBusy(false)
    }
  }

  function removeImage() {
    setForm((f) => ({ ...f, imageUrl: null }))
    setImageChanged(true)
    setImageInfo('')
  }

  function startEdit(item) {
    setEditingId(item.id)
    const resolvedType = item.itemType || (isFoodCategory(item) ? 'food' : 'drink')
    const hasExplicitGroups = Array.isArray(item.optionGroupIds) && item.optionGroupIds.length > 0
    const isCustomDisabled = item.customizable === false
    setForm({
      name: item.name || '',
      desc: item.desc || '',
      itemType: resolvedType,
      category: item.category || (resolvedType === 'food' ? 'Makanan' : 'Minuman'),
      subcategory: item.subcategory || '',
      price: getBasePrice(item),
      tag: item.tag || '',
      inStock: item.inStock !== false,
      allowSugar: isCustomDisabled ? false : hasExplicitGroups ? item.optionGroupIds.includes('gula') : resolvedType === 'drink',
      allowIce: isCustomDisabled ? false : hasExplicitGroups ? item.optionGroupIds.includes('es') : resolvedType === 'drink',
      allowTopping: isCustomDisabled ? false : hasExplicitGroups ? item.optionGroupIds.includes('topping') : resolvedType === 'drink',
      allowNote: isCustomDisabled ? false : hasExplicitGroups ? item.optionGroupIds.includes('catatan') : true,
      imageUrl: item.imageUrl ?? null,
    })
    setImageChanged(false)
    setImageInfo('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim() || form.price === '') {
      alert('Nama dan harga wajib diisi.')
      return
    }
    if (/[a-zA-Z]/.test(String(form.price).trim())) {
      alert('Harga hanya boleh berisi angka, tidak boleh mengandung huruf.')
      return
    }
    setSaving(true)
    const optionGroupIds = []
    if (form.itemType === 'drink') {
      if (form.allowSugar) optionGroupIds.push('gula')
      if (form.allowIce) optionGroupIds.push('es')
      if (form.allowTopping) optionGroupIds.push('topping')
    }
    if (form.allowNote) optionGroupIds.push('catatan')

    const base = {
      name: form.name.trim(),
      desc: form.desc.trim(),
      itemType: form.itemType,
      category: form.category.trim(),
      subcategory: (form.subcategory || '').trim() || null,
      inStock: form.inStock,
      tag: form.tag.trim() || null,
      price: Number(form.price),
      stock: null,
      basePrice: null,
      customizable: optionGroupIds.length > 0,
      optionGroupIds,
    }
    try {
      if (editingId) {
        await updateMenuItem(editingId, imageChanged ? { ...base, imageUrl: form.imageUrl } : base)
      } else {
        await addMenuItem({ ...base, imageUrl: form.imageUrl })
      }
      resetForm()
    } catch (err) {
      alert('Gagal menyimpan: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleStock(item) {
    try {
      await updateMenuItem(item.id, { inStock: !item.inStock })
      setActiveMenuActionId(null)
    } catch (err) {
      alert('Gagal mengubah stok: ' + err.message)
    }
  }

  async function removeItem(item) {
    if (!confirm(`Hapus menu "${item.name}"?`)) return
    try {
      await deleteMenuItem(item.id)
      setActiveMenuActionId(null)
    } catch (err) {
      alert('Gagal menghapus: ' + err.message)
    }
  }

  async function handleImportSeed() {
    if (!confirm(`Isi data contoh? Ini menambahkan menu dan template opsi awal jika belum ada.`)) return
    setImporting(true)
    try {
      const n = await importSeed(seedMenuItems, seedOptionGroups)
      alert(n === 0 ? 'Semua data contoh sudah ada.' : `${n} dokumen ditambahkan.`)
    } catch (err) {
      alert('Gagal import: ' + err.message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FBFDFB] text-slate-800">
      <TopNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Header Atas Persis Mockup */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#EAF5EE] text-[#124734] flex items-center justify-center shrink-0 shadow-2xs">
              <span className="material-symbols-outlined text-[26px]">eco</span>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Kelola Menu</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Atur menu minuman dan makanan di outlet Anda.</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {items.length === 0 && (
              <button
                onClick={handleImportSeed}
                disabled={importing}
                className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors disabled:opacity-50"
              >
                {importing ? 'Mengisi...' : '⬇️ Isi Data Contoh'}
              </button>
            )}
            <button
              onClick={() => {
                resetForm()
                document.getElementById('input-nama-menu')?.focus()
              }}
              className="bg-[#124734] hover:bg-[#0c3124] text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>Tambah Menu</span>
            </button>
          </div>
        </div>

        {/* Layout Grid: Kiri Form (380px) & Kanan Tabel */}
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
          {/* ==================================================== */}
          {/* KIRI: FORM TAMBAH / EDIT MENU (PERSIS MOCKUP)       */}
          {/* ==================================================== */}
          <form
            onSubmit={handleSubmit}
            className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs overflow-visible"
          >
            {/* Header Form */}
            <div className="flex items-center gap-2 mb-4 pb-1">
              <div className="w-5 h-5 rounded-full bg-[#124734] text-white flex items-center justify-center text-xs font-black">
                +
              </div>
              <h2 className="font-extrabold text-sm sm:text-base text-slate-900">
                {editingId ? 'Edit Menu' : 'Tambah Menu'}
              </h2>
            </div>

            <div className="space-y-4">
              {/* Box Upload Foto */}
              <div>
                {form.imageUrl ? (
                  <div className="relative rounded-2xl border border-emerald-100 bg-[#F4F9F5] p-3 flex items-center gap-3">
                    <img
                      src={form.imageUrl}
                      alt="Preview"
                      className="w-16 h-16 rounded-xl object-cover border border-slate-200/80 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">Foto Terpasang</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{imageInfo || 'Siap disimpan'}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <label className="text-[11px] font-bold text-[#124734] hover:underline cursor-pointer">
                          Ganti Foto
                          <input type="file" accept="image/*" onChange={handlePickImage} disabled={imageBusy} className="hidden" />
                        </label>
                        <span className="text-slate-300">•</span>
                        <button type="button" onClick={removeImage} className="text-[11px] font-bold text-red-500 hover:underline">
                          Hapus
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <label
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const file = e.dataTransfer?.files?.[0];
                      if (file) handlePickImage(file);
                    }}
                    className="border-2 border-dashed border-[#CDE5D5] hover:border-[#124734] bg-[#F4F9F5] hover:bg-[#EBF5EE] rounded-2xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
                  >
                    <input type="file" accept="image/*" onChange={handlePickImage} disabled={imageBusy} className="hidden" />
                    <div className="w-11 h-11 rounded-2xl bg-white border border-emerald-100 text-emerald-700 flex items-center justify-center mb-2 shadow-2xs group-hover:scale-105 transition-transform">
                      <span className="material-symbols-outlined text-[24px]">image</span>
                    </div>
                    <p className="text-xs font-bold text-slate-900">
                      {imageBusy ? 'Memproses...' : 'Upload Foto'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Drag &amp; drop atau klik untuk memilih file</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">JPG, PNG (maks. 2MB)</p>
                  </label>
                )}
              </div>

              {/* Nama Menu */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Nama Menu <span className="text-red-500">*</span>
                </label>
                <input
                  id="input-nama-menu"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20 transition-all"
                  placeholder="Contoh: Matcha Latte"
                  required
                />
              </div>

              {/* Deskripsi */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">Deskripsi</label>
                <textarea
                  value={form.desc}
                  maxLength={200}
                  onChange={(e) => setForm({ ...form, desc: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20 transition-all resize-none"
                  rows={2}
                  placeholder="Deskripsi singkat menu..."
                />
                <div className="text-right -mt-1">
                  <span className="text-[10px] font-medium text-slate-400">{form.desc.length}/200</span>
                </div>
              </div>

              {/* Kategori Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Kategori <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">
                    {form.itemType === 'food' ? 'lunch_dining' : 'local_cafe'}
                  </span>
                  <select
                    value={form.category}
                    onChange={(e) => {
                      const newCat = e.target.value
                      const isFood = FOOD_CATEGORIES.includes(newCat) || isFoodCategory(newCat)
                      setForm({
                        ...form,
                        category: newCat,
                        itemType: isFood ? 'food' : 'drink',
                        subcategory: '',
                      })
                    }}
                    className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20 transition-all appearance-none cursor-pointer"
                    required
                  >
                    <optgroup label="Minuman">
                      {DRINK_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Makanan">
                      {FOOD_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </optgroup>
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">
                    expand_more
                  </span>
                </div>
              </div>

              {/* Sub Kategori Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">Sub Kategori (Opsional)</label>
                <div className="relative">
                  <select
                    value={form.subcategory || ''}
                    onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20 transition-all appearance-none cursor-pointer pr-9"
                  >
                    <option value="">Pilih sub kategori</option>
                    {(SUBCATEGORIES[form.category] || []).map((sub) => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">
                    expand_more
                  </span>
                </div>
              </div>

              {/* Harga */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Harga <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">Rp</span>
                  <input
                    type="number"
                    min="0"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20 transition-all"
                    placeholder="0"
                    required
                  />
                </div>
              </div>

              {/* Opsi Kustomisasi Menu */}
              <div className="p-3.5 rounded-2xl bg-[#FBFDFB] border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Opsi Kustomisasi</span>
                  {form.itemType === 'drink' && (
                    <Link
                      to="/kustom"
                      className="text-[11px] font-bold text-[#124734] hover:underline flex items-center gap-0.5"
                    >
                      <span>Atur Topping</span>
                      <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                    </Link>
                  )}
                </div>

                <div className="space-y-2">
                  {form.itemType === 'drink' && (
                    <>
                      <label className="flex items-center justify-between gap-2 cursor-pointer text-xs text-slate-700">
                        <span className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px] text-[#124734]">water_drop</span>
                          <span>Kustom Level Gula</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={form.allowSugar}
                          onChange={(e) => setForm((f) => ({ ...f, allowSugar: e.target.checked }))}
                          className="w-4 h-4 rounded accent-[#124734] cursor-pointer"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-2 cursor-pointer text-xs text-slate-700">
                        <span className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px] text-[#124734]">ac_unit</span>
                          <span>Kustom Level Es</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={form.allowIce}
                          onChange={(e) => setForm((f) => ({ ...f, allowIce: e.target.checked }))}
                          className="w-4 h-4 rounded accent-[#124734] cursor-pointer"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-2 cursor-pointer text-xs text-slate-700">
                        <span className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px] text-[#124734]">bubble_chart</span>
                          <span>Bisa Tambah Topping</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={form.allowTopping}
                          onChange={(e) => setForm((f) => ({ ...f, allowTopping: e.target.checked }))}
                          className="w-4 h-4 rounded accent-[#124734] cursor-pointer"
                        />
                      </label>
                    </>
                  )}
                  <label className="flex items-center justify-between gap-2 cursor-pointer text-xs text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-[#124734]">edit_note</span>
                      <span>Catatan untuk Barista</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={form.allowNote}
                      onChange={(e) => setForm((f) => ({ ...f, allowNote: e.target.checked }))}
                      className="w-4 h-4 rounded accent-[#124734] cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Ketersediaan Menu Toggle (Ready / Habis) */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">Ketersediaan Menu</label>
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.inStock}
                    onClick={() => setForm((f) => ({ ...f, inStock: !f.inStock }))}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      form.inStock ? 'bg-[#124734]' : 'bg-red-500'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        form.inStock ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className={`text-xs font-bold ${form.inStock ? 'text-[#124734]' : 'text-red-600'}`}>
                    {form.inStock ? 'Tersedia (Ready)' : 'Habis (Sold Out)'}
                  </span>
                </div>
              </div>

              {/* Tag Tambahan (Opsional) */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">Tag Khusus (Opsional)</label>
                <input
                  value={form.tag}
                  onChange={(e) => setForm({ ...form, tag: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#124734] transition-all"
                  placeholder="Limited, Best Seller, Seasonal"
                />
              </div>
            </div>

            {/* Tombol Aksi Bawah: Reset & Simpan */}
            <div className="mt-5 pt-4 border-t border-slate-100 flex gap-2.5">
              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
                className="w-28 py-2.5 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[15px]">refresh</span>
                <span>Reset</span>
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#124734] hover:bg-[#0c3124] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <span className="material-symbols-outlined text-[15px] animate-spin">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[16px]">save</span>
                )}
                <span>{saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Simpan'}</span>
              </button>
            </div>
          </form>

          {/* ==================================================== */}
          {/* KANAN: DAFTAR MENU TABEL (PERSIS MOCKUP)            */}
          {/* ==================================================== */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs flex flex-col justify-between min-h-[600px]">
            <div>
              {/* Header Card Kanan */}
              <div className="flex items-center gap-2 mb-4 pb-1">
                <span className="material-symbols-outlined text-[#124734] text-[22px]">format_list_bulleted</span>
                <h2 className="font-extrabold text-sm sm:text-base text-slate-900">Daftar Menu</h2>
              </div>

              {/* Toolbar: Search & Filter Tabs & Filter Button */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                {/* Search Bar */}
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                    search
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setCurrentPage(1)
                    }}
                    placeholder="Cari menu..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#124734] transition-all"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <span className="material-symbols-outlined text-[15px]">close</span>
                    </button>
                  )}
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => { setFilterType('all'); setCurrentPage(1); }}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                        filterType === 'all'
                          ? 'bg-[#124734] text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200/80 text-slate-600'
                      }`}
                    >
                      Semua ({items.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => { setFilterType('drink'); setCurrentPage(1); }}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                        filterType === 'drink'
                          ? 'bg-[#124734] text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200/80 text-slate-600'
                      }`}
                    >
                      Minuman ({drinkCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => { setFilterType('food'); setCurrentPage(1); }}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                        filterType === 'food'
                          ? 'bg-[#124734] text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200/80 text-slate-600'
                      }`}
                    >
                      Makanan ({foodCount})
                    </button>
                  </div>

                  {/* Tombol Filter Tambahan */}
                  <Link
                    to="/kustom"
                    title="Kustom Menu & Opsi"
                    className="border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1 hover:bg-slate-50 transition-colors shrink-0"
                  >
                    <span className="material-symbols-outlined text-[15px]">tune</span>
                    <span>Filter</span>
                  </Link>
                </div>
              </div>

              {/* Tabel Menu */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-2">Menu</th>
                      <th className="py-3 px-2">Kategori</th>
                      <th className="py-3 px-2">Harga</th>
                      <th className="py-3 px-2">Ketersediaan</th>
                      <th className="py-3 px-2 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                    {loading && (
                      <tr>
                        <td colSpan="5" className="py-12 text-center text-slate-400">
                          <span className="material-symbols-outlined text-3xl animate-spin">progress_activity</span>
                          <p className="mt-2 text-xs">Memuat menu...</p>
                        </td>
                      </tr>
                    )}

                    {!loading && paginatedItems.length === 0 && (
                      <tr>
                        <td colSpan="5" className="py-12 text-center text-slate-400">
                          <span className="material-symbols-outlined text-3xl text-slate-300">search_off</span>
                          <p className="mt-2 font-bold text-slate-600">Tidak ada menu yang sesuai</p>
                          <p className="text-xs text-slate-400 mt-0.5">Coba ubah kata kunci pencarian atau filter.</p>
                        </td>
                      </tr>
                    )}

                    {!loading && paginatedItems.map((item) => {
                      const isFood = isFoodCategory(item)
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                          {/* Kolom Menu (Foto + Nama + Deskripsi) */}
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-3">
                              <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                                {item.imageUrl ? (
                                  <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="material-symbols-outlined text-emerald-700 text-[20px]">
                                    {isFood ? 'lunch_dining' : 'local_cafe'}
                                  </span>
                                )}
                              </div>
                              <div className="min-w-0 max-w-[220px]">
                                <p className="font-bold text-slate-900 truncate leading-snug">{item.name}</p>
                                <p className="text-[11px] text-slate-400 truncate mt-0.5">{item.desc || 'Tanpa deskripsi'}</p>
                              </div>
                            </div>
                          </td>

                          {/* Kolom Kategori (Badge Hijau Soft dengan icon) */}
                          <td className="py-3 px-2 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EBF5EE] text-[#124734] text-[11px] font-bold">
                              <span className="material-symbols-outlined text-[13px]">
                                {isFood ? 'lunch_dining' : 'local_cafe'}
                              </span>
                              <span>{item.category || (isFood ? 'Makanan' : 'Minuman')}</span>
                            </span>
                          </td>

                          {/* Kolom Harga */}
                          <td className="py-3 px-2 font-bold text-slate-900 whitespace-nowrap">
                            {rupiah(getBasePrice(item))}
                          </td>

                          {/* Kolom Status (Tersedia hijau / Habis merah) */}
                          <td className="py-3 px-2 whitespace-nowrap">
                            {item.inStock !== false ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#EAF8F0] text-emerald-700 border border-emerald-200/50">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                <span>Tersedia</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200/50">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                <span>Habis</span>
                              </span>
                            )}
                          </td>

                          {/* Kolom Aksi (Edit & More) */}
                          <td className="py-3 px-2 text-center whitespace-nowrap">
                            <div className="relative inline-flex items-center gap-1.5 justify-center">
                              {/* Tombol Edit */}
                              <button
                                type="button"
                                onClick={() => startEdit(item)}
                                title="Edit Menu"
                                className="w-8 h-8 rounded-full border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center transition-colors"
                              >
                                <span className="material-symbols-outlined text-[16px]">edit</span>
                              </button>

                              {/* Tombol More Titik Tiga */}
                              <button
                                type="button"
                                onClick={() => setActiveMenuActionId(activeMenuActionId === item.id ? null : item.id)}
                                title="Menu Opsi"
                                className="w-8 h-8 rounded-full border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center transition-colors"
                              >
                                <span className="material-symbols-outlined text-[16px]">more_vert</span>
                              </button>

                              {/* Popover Menu Aksi */}
                              {activeMenuActionId === item.id && (
                                <div className="absolute right-0 top-10 z-30 w-40 bg-white rounded-2xl shadow-xl border border-slate-100 py-1.5 text-left">
                                  <button
                                    onClick={() => toggleStock(item)}
                                    className="w-full px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                  >
                                    <span className="material-symbols-outlined text-[15px]">
                                      {item.inStock !== false ? 'block' : 'check_circle'}
                                    </span>
                                    <span>{item.inStock !== false ? 'Tandai Habis' : 'Tandai Tersedia'}</span>
                                  </button>
                                  <button
                                    onClick={() => removeItem(item)}
                                    className="w-full px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2"
                                  >
                                    <span className="material-symbols-outlined text-[15px]">delete</span>
                                    <span>Hapus Menu</span>
                                  </button>
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
            </div>

            {/* Footer Pagination Persis Mockup */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
              <p>
                Menampilkan{' '}
                <span className="font-semibold text-slate-700">
                  {filteredItems.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
                </span>
                –
                <span className="font-semibold text-slate-700">
                  {Math.min(currentPage * pageSize, filteredItems.length)}
                </span>{' '}
                dari <span className="font-semibold text-slate-700">{filteredItems.length}</span> menu
              </p>

              {totalPages > 1 && (
                <div className="flex items-center gap-1 self-end sm:self-auto">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined text-[15px]">chevron_left</span>
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors ${
                        currentPage === page
                          ? 'bg-[#124734] text-white shadow-2xs'
                          : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined text-[15px]">chevron_right</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
