import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import TopNav from '../components/TopNav.jsx'
import { listenToOptionGroupsAdmin, saveOptionGroup } from '../api/optionGroups.js'
import { seedOptionGroups } from '../data/seedOptionGroups.js'

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20 transition-all'
const labelCls = 'block text-xs font-bold text-slate-800 mb-1.5'
const rupiah = (n) => `Rp${Number(n || 0).toLocaleString('id-ID')}`

// Panduan & rekomendasi kode icon Material Symbols untuk topping minuman
const TOPPING_ICON_GUIDE = [
  { code: 'bubble_chart', label: 'Boba / Pearl' },
  { code: 'layers', label: 'Grass Jelly / Cincau' },
  { code: 'grain', label: 'Nata / Crunchy' },
  { code: 'spa', label: 'Aloe Vera / Herbal' },
  { code: 'local_cafe', label: 'Cheese Foam / Cream' },
  { code: 'cookie', label: 'Oreo / Biskuit' },
  { code: 'water_drop', label: 'Sirup / Madu' },
  { code: 'nutrition', label: 'Potongan Buah' },
  { code: 'ac_unit', label: 'Pudding / Dingin' },
  { code: 'star', label: 'Spesial / Lainnya' },
]

function slugifyId(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || `topping_${Date.now()}`
}

const emptyForm = {
  id: '',
  label: '',
  priceDelta: '3000',
  icon: 'bubble_chart',
  available: true,
}

export default function OptionsAdmin() {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const unsub = listenToOptionGroupsAdmin((list) => {
      setGroups(list)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  // Ambil grup 'topping' dari Firestore, atau fallback ke seed jika belum ada di Firestore
  const toppingGroup = useMemo(() => {
    const fromDb = groups.find((g) => g.id === 'topping')
    if (fromDb) return fromDb
    return seedOptionGroups.find((g) => g.id === 'topping')
  }, [groups])

  const toppings = useMemo(() => {
    const list = toppingGroup?.choices || []
    if (!search.trim()) return list
    const q = search.toLowerCase().trim()
    return list.filter((t) => (t.label || '').toLowerCase().includes(q))
  }, [toppingGroup, search])

  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
  }

  function startEdit(item) {
    setEditingId(item.id)
    setForm({
      id: item.id,
      label: item.label || '',
      priceDelta: String(item.priceDelta ?? 0),
      icon: item.icon || 'bubble_chart',
      available: item.available !== false,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function persistChoices(nextChoices) {
    const baseGroup = toppingGroup || seedOptionGroups.find((g) => g.id === 'topping')
    await saveOptionGroup({
      ...baseGroup,
      id: 'topping',
      label: baseGroup?.label || 'Topping Tambahan',
      type: 'multi',
      ui: 'toppings',
      required: false,
      min: 0,
      max: null,
      order: baseGroup?.order ?? 3,
      active: true,
      choices: nextChoices,
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const cleanLabel = form.label.trim()
    if (!cleanLabel) {
      alert('Nama topping wajib diisi.')
      return
    }
    if (/[a-zA-Z]/.test(String(form.priceDelta).trim())) {
      alert('Harga tambahan hanya boleh berisi angka.')
      return
    }

    const priceNum = Math.max(0, Number(form.priceDelta || 0))
    const cleanIcon = (form.icon || 'bubble_chart').trim() || 'bubble_chart'
    const currentChoices = [...(toppingGroup?.choices || [])]

    setSaving(true)
    try {
      let nextChoices
      if (editingId) {
        nextChoices = currentChoices.map((c) =>
          c.id === editingId
            ? { ...c, label: cleanLabel, priceDelta: priceNum, icon: cleanIcon, available: form.available }
            : c
        )
      } else {
        let newId = slugifyId(cleanLabel)
        if (currentChoices.some((c) => c.id === newId)) {
          newId = `${newId}_${Date.now().toString().slice(-4)}`
        }
        nextChoices = [
          ...currentChoices,
          { id: newId, label: cleanLabel, priceDelta: priceNum, icon: cleanIcon, available: form.available },
        ]
      }
      await persistChoices(nextChoices)
      resetForm()
    } catch (err) {
      alert('Gagal menyimpan topping: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleAvailable(item) {
    const currentChoices = [...(toppingGroup?.choices || [])]
    const nextChoices = currentChoices.map((c) =>
      c.id === item.id ? { ...c, available: c.available === false } : c
    )
    try {
      await persistChoices(nextChoices)
    } catch (err) {
      alert('Gagal mengubah status topping: ' + err.message)
    }
  }

  async function handleDelete(item) {
    if (!confirm(`Hapus topping "${item.label}"?`)) return
    const currentChoices = [...(toppingGroup?.choices || [])]
    const nextChoices = currentChoices.filter((c) => c.id !== item.id)
    try {
      await persistChoices(nextChoices)
      if (editingId === item.id) resetForm()
    } catch (err) {
      alert('Gagal menghapus topping: ' + err.message)
    }
  }

  return (
    <div className="min-h-screen bg-[#FBFDFB] text-slate-800">
      <TopNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Header Halaman */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#EAF5EE] text-[#124734] flex items-center justify-center shrink-0 shadow-2xs">
              <span className="material-symbols-outlined text-[26px]">bubble_chart</span>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                Kelola Topping & Add-on
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Tambah atau atur daftar topping yang dapat dipilih pelanggan pada minuman.
              </p>
            </div>
          </div>

          <Link
            to="/menu"
            className="inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors self-start sm:self-auto"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>Kembali ke Kelola Menu</span>
          </Link>
        </div>

        {/* Info Banner */}
        <div className="mb-6 p-3.5 rounded-2xl bg-[#EAF5EE]/70 border border-[#124734]/15 flex items-start gap-2.5 text-xs text-[#124734]">
          <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">info</span>
          <p className="leading-relaxed">
            Untuk menentukan apakah suatu minuman boleh memakai <strong>Level Gula</strong>,{' '}
            <strong>Level Es</strong>, atau <strong>Topping</strong>, silakan centang pengaturannya langsung saat
            membuat atau mengedit item di halaman{' '}
            <Link to="/menu" className="font-bold underline">
              Kelola Menu
            </Link>
            .
          </p>
        </div>

        {/* Grid 2 Kolom: Form Kiri + Daftar Kanan */}
        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6 items-start">
          {/* ==================================================== */}
          {/* KIRI: FORM TAMBAH / EDIT TOPPING                     */}
          {/* ==================================================== */}
          <form
            onSubmit={handleSubmit}
            className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-[#124734] text-white flex items-center justify-center text-xs font-black">
                  {editingId ? '✎' : '+'}
                </div>
                <h2 className="text-base font-extrabold text-slate-900">
                  {editingId ? 'Edit Topping' : 'Tambah Topping Baru'}
                </h2>
              </div>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Batal
                </button>
              )}
            </div>

            {/* Nama Topping */}
            <div>
              <label className={labelCls}>
                Nama Topping <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Contoh: Cheese Foam, Pearl / Boba"
                className={inputCls}
                required
              />
            </div>

            {/* Harga Tambahan */}
            <div>
              <label className={labelCls}>
                Harga Tambahan <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
                <input
                  type="number"
                  min="0"
                  value={form.priceDelta}
                  onChange={(e) => setForm({ ...form, priceDelta: e.target.value })}
                  placeholder="3000"
                  className={`${inputCls} pl-9`}
                  required
                />
              </div>
            </div>

            {/* Panduan & Pemilih Icon */}
            <div className="p-3.5 rounded-2xl bg-[#FBFDFB] border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Pilih Icon Topping</span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#124734] bg-[#EAF5EE] px-2.5 py-0.5 rounded-full">
                  <span className="material-symbols-outlined text-[14px]">{form.icon || 'bubble_chart'}</span>
                  <span>Preview</span>
                </span>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                Pilih ikon yang paling cocok dari panduan di bawah ini:
              </p>

              <div className="grid grid-cols-2 gap-1.5">
                {TOPPING_ICON_GUIDE.map((item) => {
                  const active = form.icon === item.code
                  return (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => setForm({ ...form, icon: item.code })}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-left transition-all ${
                        active
                          ? 'bg-[#124734] text-white border-[#124734] shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px] shrink-0">{item.code}</span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold truncate leading-tight">{item.label}</p>
                        <p className={`text-[9px] truncate ${active ? 'text-white/75' : 'text-slate-400'}`}>
                          {item.code}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Input kode manual opsional */}
              <div className="pt-1">
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Atau ketik kode Material Symbol lain:
                </label>
                <input
                  type="text"
                  value={form.icon}
                  onChange={(e) => setForm({ ...form, icon: e.target.value })}
                  placeholder="Contoh: icecream"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-[#124734]"
                />
              </div>
            </div>

            {/* Status Ketersediaan */}
            <div>
              <label className={labelCls}>Ketersediaan Topping</label>
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.available}
                  onClick={() => setForm((f) => ({ ...f, available: !f.available }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                    form.available ? 'bg-[#124734]' : 'bg-red-500'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ${
                      form.available ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className={`text-xs font-bold ${form.available ? 'text-[#124734]' : 'text-red-600'}`}>
                  {form.available ? 'Tersedia (Ready)' : 'Habis (Sold Out)'}
                </span>
              </div>
            </div>

            {/* Tombol Submit */}
            <div className="pt-3 border-t border-slate-100 flex gap-2.5">
              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
                className="w-24 py-2.5 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1 transition-colors"
              >
                <span className="material-symbols-outlined text-[15px]">refresh</span>
                <span>Reset</span>
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#124734] hover:bg-[#0c3124] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {saving ? 'progress_activity' : 'save'}
                </span>
                <span>{saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Simpan Topping'}</span>
              </button>
            </div>
          </form>

          {/* ==================================================== */}
          {/* KANAN: DAFTAR TOPPING                                */}
          {/* ==================================================== */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">Daftar Topping Aktif & Nonaktif</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Total {(toppingGroup?.choices || []).length} pilihan topping terdaftar
                </p>
              </div>
              <div className="relative w-full sm:w-56">
                <span className="material-symbols-outlined text-[17px] text-slate-400 absolute left-3 top-1/2 -translate-y-1/2">
                  search
                </span>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari topping..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:bg-white focus:border-[#124734]"
                />
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-slate-400">
                <span className="material-symbols-outlined text-3xl animate-spin">progress_activity</span>
                <p className="mt-2 text-xs">Memuat daftar topping...</p>
              </div>
            ) : toppings.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <span className="material-symbols-outlined text-4xl text-slate-300">bubble_chart</span>
                <p className="mt-2 text-sm font-bold text-slate-600">Belum ada topping</p>
                <p className="text-xs mt-0.5">Tambahkan topping baru lewat form di sebelah kiri.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {toppings.map((item) => {
                  const ready = item.available !== false
                  return (
                    <div
                      key={item.id}
                      className="py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/70 px-2 rounded-xl transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            ready ? 'bg-[#EAF5EE] text-[#124734]' : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[20px]">
                            {item.icon || 'bubble_chart'}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-bold truncate ${ready ? 'text-slate-900' : 'text-slate-400 line-through'}`}>
                            {item.label}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs font-bold text-[#124734]">+{rupiah(item.priceDelta)}</span>
                            <span className="text-slate-300">•</span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                ready
                                  ? 'bg-[#EAF8F0] text-emerald-700'
                                  : 'bg-red-50 text-red-600'
                              }`}
                            >
                              {ready ? 'Tersedia' : 'Habis'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleAvailable(item)}
                          title={ready ? 'Tandai Habis' : 'Tandai Tersedia'}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                            ready
                              ? 'border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100'
                              : 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                          }`}
                        >
                          {ready ? 'Set Habis' : 'Set Ready'}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          title="Edit Topping"
                          className="w-8 h-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px]">edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          title="Hapus Topping"
                          className="w-8 h-8 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
