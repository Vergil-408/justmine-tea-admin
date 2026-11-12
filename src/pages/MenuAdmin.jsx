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
import { menuGroupIds } from '../utils/optionAdmin.js'
import TopNav from '../components/TopNav.jsx'

const emptyForm = {
  name: '',
  desc: '',
  itemType: 'drink', // 'drink' | 'food'
  category: 'Signature Tea',
  subcategory: '',
  price: '',
  stock: '',
  tag: '',
  inStock: true,
  imageUrl: null,
}

function rupiah(n) {
  return `Rp${Number(n || 0).toLocaleString('id-ID')}`
}

const DRINK_CATEGORIES = [
  'Signature Tea',
  'Tropical',
  'Classic Tea',
  'Fruit Tea',
  'Milk Tea',
  'Coffee Series',
  'Paket Promo',
]

const FOOD_CATEGORIES = [
  'Main Course',
  'Snacks',
  'Dessert',
  'Pastry & Bakery',
  'Paket Promo',
  'Combo',
]

// Subkategori per kategori
const SUBCATEGORIES = {
  'Signature Tea': ['Original', 'Lychee', 'Jasmine', 'Matcha', 'Oolong'],
  'Tropical': ['Mangga', 'Nanas', 'Passion Fruit', 'Coconut'],
  'Classic Tea': ['Green Tea', 'Black Tea', 'Chamomile', 'Earl Grey'],
  'Fruit Tea': ['Lemon', 'Strawberry', 'Peach', 'Watermelon'],
  'Milk Tea': ['Brown Sugar', 'Taro', 'Thai Tea', 'Oat Milk'],
  'Coffee Series': ['Americano', 'Latte', 'Cappuccino', 'Cold Brew'],
  'Main Course': ['Nasi', 'Mie', 'Pasta'],
  'Snacks': ['Goreng', 'Bakar', 'Rebus'],
  'Dessert': ['Ice Cream', 'Pudding', 'Cake'],
  'Pastry & Bakery': ['Roti', 'Croissant', 'Muffin'],
  'Paket Promo': [],
  'Combo': [],
}

// legacy compat
const DEFAULT_DRINK_CATEGORIES = DRINK_CATEGORIES
const DEFAULT_FOOD_CATEGORIES = FOOD_CATEGORIES

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
  const [filterType, setFilterType] = useState('all') // 'all' | 'drink' | 'food'

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

  // Filter daftar menu berdasarkan filterType
  const displayedItems = useMemo(() => {
    if (filterType === 'drink') return items.filter((i) => !isFoodCategory(i))
    if (filterType === 'food') return items.filter((i) => isFoodCategory(i))
    return items
  }, [items, filterType])

  // Saran kategori dinamis sesuai jenis menu (drink vs food) yang dipilih
  const suggestedCategories = useMemo(() => {
    const defaults = form.itemType === 'food' ? DEFAULT_FOOD_CATEGORIES : DEFAULT_DRINK_CATEGORIES
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
    const file = e.target.files?.[0]
    e.target.value = '' // supaya file yang sama bisa dipilih ulang
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
    setForm({
      name: item.name || '',
      desc: item.desc || '',
      itemType: resolvedType,
      category: item.category || (resolvedType === 'food' ? 'Snacks' : 'Signature Tea'),
      subcategory: item.subcategory || '',
      price: getBasePrice(item),
      stock: item.stock ?? '',
      tag: item.tag || '',
      inStock: item.inStock !== false,
      imageUrl: item.imageUrl ?? null,
    })
    setImageChanged(false)
    setImageInfo('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.price) {
      alert('Nama dan harga wajib diisi.')
      return
    }
    setSaving(true)
    // Field itemType dan category disimpan ke Firestore agar admin memiliki kendali penuh
    const base = {
      name: form.name.trim(),
      desc: form.desc.trim(),
      itemType: form.itemType, // 'drink' | 'food'
      category: form.category.trim(),
      subcategory: (form.subcategory || '').trim() || null,
      inStock: form.inStock,
      tag: form.tag.trim() || null,
      price: Number(form.price),
      stock: form.stock !== '' ? Number(form.stock) : null,
      basePrice: null, // field lama
    }
    try {
      if (editingId) {
        // imageUrl hanya ikut dikirim kalau foto diganti/dihapus (menghindari mengirim ulang data besar)
        await updateMenuItem(editingId, imageChanged ? { ...base, imageUrl: form.imageUrl } : base)
      } else {
        await addMenuItem({ ...base, imageUrl: form.imageUrl, customizable: false, optionGroupIds: [] })
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
    } catch (err) {
      alert('Gagal mengubah stok: ' + err.message)
    }
  }

  async function removeItem(item) {
    if (!confirm(`Hapus menu "${item.name}"?`)) return
    try {
      await deleteMenuItem(item.id)
    } catch (err) {
      alert('Gagal menghapus: ' + err.message)
    }
  }

  async function handleImportSeed() {
    if (
      !confirm(
        `Isi data contoh? Ini menambahkan ${seedMenuItems.length} menu dan ${seedOptionGroups.length} template opsi yang BELUM ada. Data yang sudah ada tidak ditimpa.`
      )
    )
      return
    setImporting(true)
    try {
      const n = await importSeed(seedMenuItems, seedOptionGroups)
      alert(n === 0 ? 'Semua data contoh sudah ada, tidak ada yang ditambahkan.' : `${n} dokumen ditambahkan.`)
    } catch (err) {
      alert('Gagal import: ' + err.message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="min-h-screen">
      <TopNav />

      <main className="max-w-6xl mx-auto px-5 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h1 className="text-xl font-bold">Kelola Menu</h1>
          <button
            onClick={handleImportSeed}
            disabled={importing}
            className="text-xs font-semibold px-3 py-2 rounded-full border border-border bg-surface hover:bg-sage-light transition-colors disabled:opacity-50"
          >
            {importing ? 'Mengisi...' : '⬇️ Isi Data Contoh'}
          </button>
        </div>

        {!loading && items.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-2xl px-4 py-3 mb-5">
            Menu masih kosong. Klik <strong>Isi Data Contoh</strong> di atas untuk mengisi menu dan template opsi awal, atau tambah manual lewat form di bawah.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
          {/* ===== FORM TAMBAH / EDIT MENU ===== */}
          <form onSubmit={handleSubmit} className="bg-white border border-slate-200/80 rounded-2xl shadow-xs h-fit overflow-visible">
            {/* Header Form */}
            <div className="px-5 pt-5 pb-4 border-b border-slate-100">
              <h2 className="font-extrabold text-sm text-slate-900">
                {editingId ? '✏️ Edit Menu' : '+ Tambah Menu Baru'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {editingId ? 'Perbarui data item menu.' : 'Isi informasi menu baru.'}
              </p>
            </div>

            <div className="px-5 py-4 space-y-5">
              {/* ── Bagian 1: Informasi Produk ── */}
              <fieldset>
                <legend className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                  Informasi Produk
                </legend>
                <div className="space-y-3">
                  {/* Upload Foto (Dropzone Style sesuai Mockup) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Foto Menu</label>
                    {form.imageUrl ? (
                      <div className="relative rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 p-2 flex items-center gap-3">
                        <img src={form.imageUrl} alt="Preview" className="w-16 h-16 rounded-xl object-cover border border-slate-200 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">Foto terpasang</p>
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
                          if (file) {
                            handlePickImage({ target: { files: [file], value: '' } });
                          }
                        }}
                        className="border-2 border-dashed border-emerald-200/80 hover:border-emerald-600 rounded-2xl p-4 bg-emerald-50/20 hover:bg-emerald-50/40 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
                      >
                        <input type="file" accept="image/*" onChange={handlePickImage} disabled={imageBusy} className="hidden" />
                        <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
                          <span className="material-symbols-outlined text-[22px]">add_photo_alternate</span>
                        </div>
                        <p className="text-xs font-bold text-slate-800">
                          {imageBusy ? 'Memproses...' : 'Upload Foto'}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">Drag &amp; drop atau klik untuk memilih file</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">JPG, PNG (maks. 2MB)</p>
                      </label>
                    )}
                  </div>

                  {/* Nama Menu */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Nama Menu <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20 transition-colors"
                      placeholder="Contoh: Matcha Latte"
                      required
                    />
                  </div>

                  {/* Deskripsi dengan Counter 0/200 */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-slate-700">Deskripsi</label>
                      <span className="text-[10px] font-medium text-slate-400">{form.desc.length}/200</span>
                    </div>
                    <textarea
                      value={form.desc}
                      maxLength={200}
                      onChange={(e) => setForm({ ...form, desc: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20 transition-colors resize-none"
                      rows={2}
                      placeholder="Deskripsi singkat menu..."
                    />
                  </div>

                  {/* Tag */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Tag (Opsional)</label>
                    <input
                      value={form.tag}
                      onChange={(e) => setForm({ ...form, tag: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20 transition-colors"
                      placeholder="Limited, New, Best Seller"
                    />
                  </div>
                </div>
              </fieldset>

              <div className="border-t border-slate-100" />

              {/* ── Bagian 2: Jenis & Kategori ── */}
              <fieldset>
                <legend className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                  Jenis & Kategori
                </legend>
                <div className="space-y-3">
                  {/* Jenis Menu — Segmented Button */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Jenis Menu</label>
                    <div className="inline-flex w-full border border-slate-200 rounded-xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({
                          ...f,
                          itemType: 'drink',
                          category: f.itemType === 'food' ? 'Signature Tea' : f.category,
                          subcategory: '',
                        }))}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold transition-all ${
                          form.itemType === 'drink'
                            ? 'bg-[#124734] text-white'
                            : 'bg-white text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        <span>🍵</span><span>Minuman</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({
                          ...f,
                          itemType: 'food',
                          category: f.itemType === 'drink' ? 'Snacks' : f.category,
                          subcategory: '',
                        }))}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold transition-all border-l border-slate-200 ${
                          form.itemType === 'food'
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        <span>🍛</span><span>Makanan</span>
                      </button>
                    </div>
                  </div>

                  {/* Kategori — Dropdown */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Kategori <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value, subcategory: '' })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20 transition-colors appearance-none cursor-pointer"
                      required
                    >
                      {(form.itemType === 'food' ? DEFAULT_FOOD_CATEGORIES : DEFAULT_DRINK_CATEGORIES).map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                      {/* Kategori custom dari database yang belum ada di default */}
                      {suggestedCategories
                        .filter((c) => !(form.itemType === 'food' ? DEFAULT_FOOD_CATEGORIES : DEFAULT_DRINK_CATEGORIES).includes(c))
                        .map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                  </div>

                  {/* Subkategori — Dropdown (opsional, mengikuti kategori) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Subkategori</label>
                    <select
                      value={form.subcategory || ''}
                      onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20 transition-colors appearance-none cursor-pointer"
                    >
                      <option value="">— Pilih subkategori (opsional) —</option>
                      {(SUBCATEGORIES[form.category] || []).map((sub) => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </fieldset>

              <div className="border-t border-slate-100" />

              {/* ── Bagian 3: Harga & Stok ── */}
              <fieldset>
                <legend className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                  Harga & Stok
                </legend>
                <div className="space-y-3">
                  {/* Grid Harga & Stok Berdampingan sesuai Mockup */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Harga */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Harga <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">Rp</span>
                        <input
                          type="number"
                          min="0"
                          value={form.price}
                          onChange={(e) => setForm({ ...form, price: e.target.value })}
                          className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20 transition-colors"
                          placeholder="0"
                          required
                        />
                      </div>
                    </div>

                    {/* Stok */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">Stok (Opsional)</label>
                      <input
                        type="number"
                        min="0"
                        value={form.stock ?? ''}
                        onChange={(e) => setForm({ ...form, stock: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20 transition-colors"
                        placeholder="Contoh: 100"
                      />
                    </div>
                  </div>

                  {/* Toggle Ketersediaan Menu */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Status Menu</label>
                    <div className="flex items-center gap-3 py-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={form.inStock}
                        onClick={() => setForm((f) => ({ ...f, inStock: !f.inStock }))}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          form.inStock ? 'bg-[#124734]' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            form.inStock ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                      <span className="text-xs font-bold text-slate-700">
                        {form.inStock ? 'Menu Aktif' : 'Menu Nonaktif (Draft)'}
                      </span>
                    </div>
                  </div>
                </div>
              </fieldset>
            </div>

            {/* Footer CTA */}
            <div className="px-5 pb-5 pt-3 border-t border-slate-100 flex gap-2">
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Batal
                </button>
              )}
              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[15px]">refresh</span>
                Reset
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 bg-[#124734] hover:bg-[#0c3124] text-white font-bold text-xs py-2.5 rounded-xl transition-colors disabled:opacity-50 shadow-xs"
              >
                {saving ? (
                  <span className="material-symbols-outlined text-[15px] animate-spin">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[15px]">save</span>
                )}
                <span>{saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Simpan'}</span>
              </button>
            </div>
          </form>

          {/* Daftar menu */}
          <div className="flex flex-col gap-3">
            {/* Filter Menu List: Semua, Drinks, Food */}
            <div className="flex items-center justify-between gap-2 flex-wrap bg-surface border border-border rounded-xl p-2.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setFilterType('all')}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                    filterType === 'all'
                      ? 'bg-ink text-white border-ink'
                      : 'bg-surface text-ink-muted border-border hover:border-ink'
                  }`}
                >
                  Semua ({items.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('drink')}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                    filterType === 'drink'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-surface text-ink-muted border-border hover:border-emerald-600'
                  }`}
                >
                  🍵 Drinks ({drinkCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('food')}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                    filterType === 'food'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-surface text-ink-muted border-border hover:border-amber-600'
                  }`}
                >
                  🍛 Food ({foodCount})
                </button>
              </div>
              <span className="text-xs text-ink-muted">
                {displayedItems.length} menu ditampilkan
              </span>
            </div>

            {loading && <p className="text-ink-muted text-sm">Memuat menu...</p>}
            {!loading && displayedItems.length === 0 && (
              <p className="text-ink-muted text-xs p-4 bg-surface rounded-xl border border-dashed border-border text-center">
                Tidak ada menu untuk filter ini.
              </p>
            )}
            {displayedItems.map((item) => {
              const groupCount = menuGroupIds(item).length
              const isFood = isFoodCategory(item)
              return (
                <div
                  key={item.id}
                  className={`bg-surface border border-border rounded-2xl p-4 flex items-center gap-4 ${
                    item.inStock === false ? 'opacity-60' : ''
                  }`}
                >
                  {item.imageUrl && (
                    <img src={item.imageUrl} alt="" className="w-16 aspect-[4/3] rounded-lg object-cover border border-border shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sm">{item.name}</p>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isFood
                            ? 'bg-amber-100 text-amber-900 border border-amber-200'
                            : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                        }`}
                      >
                        {isFood ? '🍛 Food' : '🍵 Drink'}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sage-light text-sage-dark uppercase">
                        {item.category}
                      </span>
                      {item.tag && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          {item.tag}
                        </span>
                      )}
                      {item.inStock === false && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                          Habis
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-muted mt-0.5 truncate">{item.desc}</p>
                    <p className="text-sm font-semibold text-sage-dark mt-1">
                      {rupiah(getBasePrice(item))}
                      <span className="ml-2 text-[11px] font-normal text-ink-muted">
                        {groupCount > 0 ? `${groupCount} grup opsi` : 'tanpa opsi'}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => toggleStock(item)}
                      title="Toggle stok"
                      className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-border hover:bg-sage-light"
                    >
                      {item.inStock === false ? 'Stokkan' : '86 (habis)'}
                    </button>
                    <button
                      onClick={() => startEdit(item)}
                      title="Edit"
                      className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-border hover:bg-sage-light"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => removeItem(item)}
                      title="Hapus"
                      className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-border text-danger hover:bg-red-50"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
