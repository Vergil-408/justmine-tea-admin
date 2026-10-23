import { useEffect, useState } from 'react'
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
import { getBasePrice } from '../utils/options.js'
import { compressImage, formatKB } from '../utils/image.js'
import { menuGroupIds } from '../utils/optionAdmin.js'
import TopNav from '../components/TopNav.jsx'

const emptyForm = {
  name: '',
  desc: '',
  category: 'signature',
  price: '',
  tag: '',
  inStock: true,
  imageUrl: null,
}

function rupiah(n) {
  return `Rp${Number(n || 0).toLocaleString('id-ID')}`
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

  useEffect(() => {
    const unsub = listenToMenuItemsAdmin((data) => {
      setItems(data.sort((a, b) => (a.name || '').localeCompare(b.name || '')))
      setLoading(false)
    })
    return unsub
  }, [])

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
    setForm({
      name: item.name || '',
      desc: item.desc || '',
      category: item.category || 'signature',
      price: getBasePrice(item),
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
    // Hanya field yang ada di form. Field opsi (customizable, optionGroupIds, optionOverrides)
    // dan imageUrl TIDAK disentuh saat edit; opsi diatur di halaman Kustom Menu.
    const base = {
      name: form.name.trim(),
      desc: form.desc.trim(),
      category: form.category, // sekarang hanya label/filter, bukan penentu alur
      inStock: form.inStock,
      tag: form.tag.trim() || null,
      price: Number(form.price),
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
          {/* Form tambah/edit */}
          <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-2xl p-5 h-fit">
            <h2 className="font-bold text-sm mb-4">{editingId ? 'Edit Menu' : 'Tambah Menu Baru'}</h2>

            <label className="block text-xs font-semibold text-ink-muted mb-1">Nama</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full mb-3 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-sage"
              placeholder="Jasmine Pure Tea"
            />

            <label className="block text-xs font-semibold text-ink-muted mb-1">Deskripsi</label>
            <textarea
              value={form.desc}
              onChange={(e) => setForm({ ...form, desc: e.target.value })}
              className="w-full mb-3 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-sage"
              rows={2}
              placeholder="Deskripsi singkat menu..."
            />

            <label className="block text-xs font-semibold text-ink-muted mb-1">Foto (opsional)</label>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-24 aspect-[4/3] rounded-lg border border-border bg-background overflow-hidden flex items-center justify-center text-ink-muted text-[10px] text-center shrink-0">
                {form.imageUrl ? (
                  <img src={form.imageUrl} alt="Pratinjau foto menu" className="w-full h-full object-cover" />
                ) : (
                  'Belum ada foto'
                )}
              </div>
              <div className="flex flex-col gap-1.5 min-w-0">
                <label className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border hover:bg-sage-light cursor-pointer text-center">
                  {imageBusy ? 'Memproses...' : form.imageUrl ? 'Ganti foto' : 'Pilih foto'}
                  <input type="file" accept="image/*" onChange={handlePickImage} disabled={imageBusy} className="hidden" />
                </label>
                {form.imageUrl && (
                  <button type="button" onClick={removeImage} className="text-[11px] text-ink-muted hover:text-danger text-left">
                    Hapus foto
                  </button>
                )}
                {imageInfo && <span className="text-[10px] text-ink-muted">{imageInfo}</span>}
              </div>
            </div>
            <p className="text-[10px] text-ink-muted -mt-1 mb-3">
              Foto otomatis dipotong rasio 4:3 dan dikecilkan supaya muat di database.
            </p>

            <label className="block text-xs font-semibold text-ink-muted mb-1">Kategori (label &amp; filter)</label>
            <div className="flex gap-2 mb-3">
              {['signature', 'customizable'].map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setForm({ ...form, category: c })}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    form.category === c ? 'bg-sage text-white border-sage' : 'border-border text-ink-muted'
                  }`}
                >
                  {c === 'signature' ? 'Signature' : 'Customizable'}
                </button>
              ))}
            </div>

            <label className="block text-xs font-semibold text-ink-muted mb-1">Harga dasar (Rp)</label>
            <input
              type="number"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              className="w-full mb-3 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-sage"
              placeholder="22000"
            />

            <label className="block text-xs font-semibold text-ink-muted mb-1">Tag (opsional)</label>
            <input
              value={form.tag}
              onChange={(e) => setForm({ ...form, tag: e.target.value })}
              className="w-full mb-3 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-sage"
              placeholder="Limited / Seasonal (boleh kosong)"
            />

            <label className="flex items-center gap-2 mb-2 text-sm">
              <input
                type="checkbox"
                checked={form.inStock}
                onChange={(e) => setForm({ ...form, inStock: e.target.checked })}
              />
              Stok tersedia
            </label>
            <p className="text-[11px] text-ink-muted mb-4">
              Es, gula, topping, dan opsi lain diatur di halaman <Link to="/kustom" className="underline font-semibold">Kustom Menu</Link>.
            </p>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-sage text-white font-semibold text-sm py-2.5 rounded-xl hover:bg-sage-dark transition-colors disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Tambah Menu'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2.5 rounded-xl border border-border text-sm font-semibold text-ink-muted"
                >
                  Batal
                </button>
              )}
            </div>
          </form>

          {/* Daftar menu */}
          <div className="flex flex-col gap-3">
            {loading && <p className="text-ink-muted text-sm">Memuat menu...</p>}
            {items.map((item) => {
              const groupCount = menuGroupIds(item).length
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
