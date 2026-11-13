import { useEffect, useMemo, useState, useRef } from 'react'
import TopNav from '../components/TopNav.jsx'
import { listenToOptionGroupsAdmin, saveOptionGroup, deleteOptionGroup } from '../api/optionGroups.js'
import { listenToMenuItemsAdmin, updateMenuItem } from '../api/menu.js'
import {
  slugify,
  uniqueId,
  SINGLE_UIS,
  UI_LABEL,
  emptyGroup,
  cleanGroup,
  validateGroup,
  cleanOverrides,
  menuGroupIds,
} from '../utils/optionAdmin.js'

/* ─── Helpers ───────────────────────────────────────────────────────── */
const inputCls = 'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20 transition-all'
const labelCls = 'block text-xs font-bold text-slate-700 mb-1.5'
const rupiah   = (n) => `Rp${Number(n || 0).toLocaleString('id-ID')}`

const GROUP_ICON = {
  gula: 'water_drop', es: 'ac_unit', topping: 'cookie', catatan: 'edit_note',
  susu: 'local_cafe', ukuran: 'straighten', size: 'straighten',
}
function groupIcon(g) {
  return GROUP_ICON[g.id] || (g.ui === 'note' ? 'edit_note' : g.type === 'multi' ? 'checklist' : 'tune')
}

/* Toggle component */
function Toggle({ on, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? 'bg-[#124734]' : 'bg-slate-300'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   GROUP EDITOR — panel kanan Tab Template Grup
═══════════════════════════════════════════════════════════════════════ */
function GroupEditor({ initial, isNew, allGroups, usedCount, onSave, onDelete, onCancel }) {
  const [d, setD]           = useState(() => ({
    ...initial,
    max: initial.max ?? '',
    showIf: initial.showIf ?? null,
    choices: (initial.choices || []).map((c) => ({ ...c })),
  }))
  const [idEdited, setIdEdited] = useState(!isNew)
  const [errors, setErrors]     = useState([])
  const [saving, setSaving]     = useState(false)
  const [advOpen, setAdvOpen]   = useState(false)
  const lockedIds = useMemo(() => new Set(isNew ? [] : (initial.choices || []).map((c) => c.id)), [initial, isNew])

  const set      = (patch) => setD((p) => ({ ...p, ...patch }))
  const isSingle = d.type === 'single'
  const isNote   = d.ui === 'note'
  const others   = allGroups.filter((g) => g.id !== d.id)

  function setLabel(label) {
    setD((p) => ({ ...p, label, ...(isNew && !idEdited ? { id: slugify(label) } : {}) }))
  }
  function setType(type) {
    setD((p) => ({ ...p, type, ui: type === 'multi' ? 'toppings' : SINGLE_UIS.includes(p.ui) ? p.ui : 'cards' }))
  }
  const setChoice = (i, patch) => setD((p) => ({ ...p, choices: p.choices.map((c, x) => (x === i ? { ...c, ...patch } : c)) }))
  function setChoiceLabel(i, label) {
    setD((p) => {
      const taken = new Set(p.choices.filter((_, x) => x !== i).map((c) => c.id))
      return {
        ...p,
        choices: p.choices.map((c, x) => {
          if (x !== i) return c
          const auto = !lockedIds.has(c.id) && !c._idEdited
          return { ...c, label, ...(auto ? { id: uniqueId(slugify(label), taken) } : {}) }
        }),
      }
    })
  }
  const addChoice    = () => setD((p) => ({ ...p, choices: [...p.choices, { id: '', label: '', icon: '', summary: '', priceDelta: 0, available: true }] }))
  function moveChoice(i, dir) {
    setD((p) => {
      const j = i + dir
      if (j < 0 || j >= p.choices.length) return p
      const next = [...p.choices];
      [next[i], next[j]] = [next[j], next[i]]
      return { ...p, choices: next }
    })
  }
  const removeChoice = (i) => setD((p) => ({ ...p, choices: p.choices.filter((_, x) => x !== i) }))

  const showIfRef = d.showIf?.groupId ? others.find((g) => g.id === d.showIf.groupId) : null
  function toggleShowIfChoice(cid) {
    const cur  = d.showIf?.choiceIds || []
    const next = cur.includes(cid) ? cur.filter((x) => x !== cid) : [...cur, cid]
    set({ showIf: { groupId: d.showIf.groupId, choiceIds: next } })
  }

  async function submit(e) {
    e.preventDefault()
    const clean = cleanGroup(d)
    const errs  = validateGroup(clean, allGroups, isNew)
    setErrors(errs)
    if (errs.length) return
    setSaving(true)
    try { await onSave(clean) }
    catch (err) { setErrors(['Gagal menyimpan: ' + err.message]) }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={submit} className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80">
        <div>
          <h2 className="font-extrabold text-base text-slate-900">
            {isNew ? 'Tambah Grup Opsi' : `Edit: ${initial.label}`}
          </h2>
          {!isNew && (
            <p className="text-xs text-slate-400 mt-0.5">
              ID: <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">{initial.id}</code>
            </p>
          )}
        </div>
        <button type="button" onClick={onCancel}
          className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
          <span className="material-symbols-outlined text-[18px] text-slate-500">close</span>
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

        {/* ── Identitas ── */}
        <section className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Identitas Grup</p>
          <div>
            <label className={labelCls}>Nama Grup <span className="text-red-500">*</span></label>
            <input value={d.label} onChange={(e) => setLabel(e.target.value)}
              className={inputCls} placeholder="Contoh: Tingkat Gula" required />
          </div>
          <div>
            <label className={labelCls}>
              ID Sistem&nbsp;
              {!isNew && <span className="text-slate-400 font-normal">(terkunci)</span>}
            </label>
            <div className="relative">
              <input value={d.id} disabled={!isNew}
                onChange={(e) => { setIdEdited(true); set({ id: e.target.value }) }}
                className={`${inputCls} font-mono text-xs ${!isNew ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''}`}
                placeholder="tingkat-gula" />
              {!isNew && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  <span className="material-symbols-outlined text-[16px] text-slate-300">lock</span>
                </span>
              )}
            </div>
          </div>
        </section>

        {/* ── Jenis pilihan ── */}
        <section className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Jenis Pilihan</p>
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button type="button" onClick={() => setType('single')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${d.type === 'single' ? 'bg-[#124734] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              <span className="material-symbols-outlined text-[15px]">radio_button_checked</span>Pilih Satu
            </button>
            <button type="button" onClick={() => setType('multi')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${d.type === 'multi' ? 'bg-[#124734] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              <span className="material-symbols-outlined text-[15px]">check_box</span>Boleh Banyak
            </button>
          </div>
          <div>
            <label className={labelCls}>Tampilan UI</label>
            <div className="relative">
              <select value={d.ui} onChange={(e) => set({ ui: e.target.value })} disabled={!isSingle}
                className={`${inputCls} appearance-none pr-9 ${!isSingle ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''}`}>
                {(isSingle ? SINGLE_UIS : ['toppings']).map((u) => (
                  <option key={u} value={u}>{UI_LABEL[u]}</option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">expand_more</span>
            </div>
          </div>
        </section>

        {/* ── Aturan ── */}
        <section>
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">Aturan</p>
          <div className="bg-slate-50 rounded-2xl divide-y divide-slate-200">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Wajib Diisi</p>
                <p className="text-[11px] text-slate-400">Pelanggan harus memilih sebelum order</p>
              </div>
              <Toggle on={!!d.required} onChange={(v) => set({ required: v })} />
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Aktif</p>
                <p className="text-[11px] text-slate-400">Tampilkan grup di aplikasi</p>
              </div>
              <Toggle on={d.active !== false} onChange={(v) => set({ active: v })} />
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Urutan Tampil</p>
                <p className="text-[11px] text-slate-400">Angka lebih kecil = tampil lebih awal</p>
              </div>
              <input type="number" value={d.order} onChange={(e) => set({ order: e.target.value })}
                className="w-20 px-3 py-2 text-sm font-bold text-center rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20" />
            </div>
            {!isSingle && (
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1">
                  <p className="text-xs font-semibold text-slate-600 mb-1">Min Pilihan</p>
                  <input type="number" min="0" value={d.min ?? 0} onChange={(e) => set({ min: e.target.value })}
                    className="w-full px-3 py-2 text-sm text-center rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-[#124734]" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-slate-600 mb-1">Maks Pilihan</p>
                  <input type="number" min="1" value={d.max} onChange={(e) => set({ max: e.target.value })}
                    placeholder="Bebas"
                    className="w-full px-3 py-2 text-sm text-center rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-[#124734]" />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Daftar Pilihan ── */}
        {!isNote && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Daftar Pilihan</p>
              <button type="button" onClick={addChoice}
                className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl bg-[#EAF5EE] text-[#124734] hover:bg-emerald-100 transition-colors">
                <span className="material-symbols-outlined text-[14px]">add</span>Tambah
              </button>
            </div>

            {d.choices.length === 0 && (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl py-6 text-center">
                <span className="material-symbols-outlined text-[28px] text-slate-300">format_list_bulleted</span>
                <p className="text-xs text-slate-400 mt-1">Belum ada pilihan. Klik Tambah.</p>
              </div>
            )}

            <div className="space-y-2.5">
              {d.choices.map((c, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2.5">
                  <div className="flex gap-2">
                    <input value={c.label} onChange={(e) => setChoiceLabel(i, e.target.value)}
                      className={`${inputCls} flex-1`} placeholder="Nama pilihan" />
                    <input type="number" min="0" value={c.priceDelta ?? 0}
                      onChange={(e) => setChoice(i, { priceDelta: e.target.value })}
                      className={`${inputCls} w-28`} title="Tambahan harga (Rp)" placeholder="+Rp" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[['id','id','font-mono text-xs'], ['icon','ikon',''], ['summary','ringkasan','']].map(([field, ph, extra]) => (
                      <div key={field}>
                        <label className="text-[10px] font-semibold text-slate-400 mb-1 block capitalize">{field === 'id' ? 'ID' : ph}</label>
                        <input value={c[field] || ''} disabled={field === 'id' && lockedIds.has(c.id)}
                          onChange={(e) => field === 'id'
                            ? setChoice(i, { id: e.target.value, _idEdited: true })
                            : setChoice(i, { [field]: e.target.value })}
                          className={`${inputCls} ${extra} ${field === 'id' && lockedIds.has(c.id) ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''}`}
                          placeholder={ph} />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <button type="button"
                      onClick={() => setChoice(i, { available: c.available === false ? true : false })}
                      className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full transition-colors ${c.available === false ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-[#EAF5EE] text-[#124734]'}`}>
                      <span className="material-symbols-outlined text-[13px]">{c.available === false ? 'block' : 'check_circle'}</span>
                      {c.available === false ? 'Habis' : 'Tersedia'}
                    </button>
                    <div className="flex items-center gap-1">
                      {[[-1,'arrow_upward', i===0],[1,'arrow_downward', i===d.choices.length-1]].map(([dir,icon,dis]) => (
                        <button key={dir} type="button" onClick={() => moveChoice(i, dir)} disabled={dis}
                          className="w-7 h-7 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center disabled:opacity-30 transition-colors">
                          <span className="material-symbols-outlined text-[15px] text-slate-500">{icon}</span>
                        </button>
                      ))}
                      <button type="button" onClick={() => removeChoice(i)}
                        className="w-7 h-7 rounded-lg border border-red-100 hover:bg-red-50 flex items-center justify-center transition-colors">
                        <span className="material-symbols-outlined text-[15px] text-red-500">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {isSingle && d.choices.length > 0 && (
              <div className="mt-3">
                <label className={labelCls}>Pilihan Default</label>
                <div className="relative">
                  <select value={d.defaultChoiceId || ''} onChange={(e) => set({ defaultChoiceId: e.target.value || null })}
                    className={`${inputCls} appearance-none pr-9`}>
                    <option value="">{d.required ? '(Pilihan pertama tersedia)' : '(Tidak ada default)'}</option>
                    {d.choices.filter((c) => c.id).map((c) => (
                      <option key={c.id} value={c.id}>{c.label || c.id}</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">expand_more</span>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Lanjutan: showIf ── */}
        <section>
          <button type="button" onClick={() => setAdvOpen((p) => !p)}
            className="w-full flex items-center justify-between py-2 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors">
            <span>Pengaturan Lanjutan (Kondisi Tampil)</span>
            <span className={`material-symbols-outlined text-[18px] transition-transform ${advOpen ? 'rotate-180' : ''}`}>expand_more</span>
          </button>
          {advOpen && (
            <div className="mt-2 bg-slate-50 rounded-2xl p-4 space-y-3">
              <div>
                <label className={labelCls}>Tampilkan hanya jika...</label>
                <div className="relative">
                  <select value={d.showIf?.groupId || ''}
                    onChange={(e) => set({ showIf: e.target.value ? { groupId: e.target.value, choiceIds: [] } : null })}
                    className={`${inputCls} appearance-none pr-9`}>
                    <option value="">Selalu tampil</option>
                    {others.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">expand_more</span>
                </div>
              </div>
              {showIfRef && (
                <div>
                  <label className={labelCls}>Jika memilih...</label>
                  <div className="flex flex-wrap gap-2">
                    {showIfRef.choices.map((c) => (
                      <label key={c.id}
                        className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border cursor-pointer transition-colors ${d.showIf.choiceIds.includes(c.id) ? 'bg-[#124734] text-white border-[#124734]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#124734]'}`}>
                        <input type="checkbox" checked={d.showIf.choiceIds.includes(c.id)}
                          onChange={() => toggleShowIfChoice(c.id)} className="hidden" />
                        {c.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Errors */}
        {errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-1">
            {errors.map((m, i) => (
              <p key={i} className="text-xs text-red-700 flex items-start gap-1.5">
                <span className="material-symbols-outlined text-[14px] mt-0.5 shrink-0">error</span>{m}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-200/80 space-y-2">
        <div className="flex gap-2">
          <button type="button" onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
            Batal
          </button>
          <button type="submit" disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-[#124734] hover:bg-[#0c3124] text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-xs">
            <span className="material-symbols-outlined text-[16px]">save</span>
            {saving ? 'Menyimpan...' : 'Simpan Grup'}
          </button>
        </div>
        {!isNew && (
          <button type="button" onClick={() => onDelete(initial, usedCount)}
            className="w-full py-2 text-xs font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors flex items-center justify-center gap-1">
            <span className="material-symbols-outlined text-[14px]">delete</span>
            Hapus grup ini{usedCount > 0 ? ` (dipakai ${usedCount} menu)` : ''}
          </button>
        )}
      </div>
    </form>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   TAB TEMPLATE GRUP
═══════════════════════════════════════════════════════════════════════ */
function TemplateGrupTab({ groups, loadingG, items, onSaveGroup, onDeleteGroup }) {
  const [editing, setEditing]           = useState(null)
  const [search, setSearch]             = useState('')
  const [filterActive, setFilterActive] = useState('semua')

  const usedCount = (gid) => items.filter((it) => menuGroupIds(it).includes(gid)).length

  const filtered = useMemo(() => {
    let list = groups
    if (filterActive === 'aktif')    list = list.filter((g) => g.active !== false)
    if (filterActive === 'nonaktif') list = list.filter((g) => g.active === false)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((g) => g.label.toLowerCase().includes(q) || g.id.toLowerCase().includes(q))
    }
    return list
  }, [groups, search, filterActive])

  async function handleSave(clean) {
    await onSaveGroup(clean)
    setEditing(null)
  }

  async function handleDelete(group, used) {
    const warn = used > 0 ? `\n\nGrup ini dipakai ${used} menu.` : ''
    if (!confirm(`Hapus grup "${group.label}"?${warn}\n\nPesanan lama tidak terpengaruh.`)) return
    await onDeleteGroup(group.id)
    setEditing(null)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 items-start">
      {/* Kolom Kiri */}
      <div className="flex flex-col gap-4">
        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">search</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm placeholder:text-slate-400 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20 transition-all"
              placeholder="Cari grup opsi..." />
          </div>
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
            {[['semua','Semua'],['aktif','Aktif'],['nonaktif','Nonaktif']].map(([k, l]) => (
              <button key={k} onClick={() => setFilterActive(k)}
                className={`px-3 py-1.5 rounded-lg transition-all ${filterActive === k ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-700'}`}>
                {l}
              </button>
            ))}
          </div>
          <button
            onClick={() => setEditing({ isNew: true, group: emptyGroup((groups.at(-1)?.order ?? 0) + 1) })}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#124734] hover:bg-[#0c3124] text-white text-xs font-bold transition-colors shadow-xs">
            <span className="material-symbols-outlined text-[16px]">add</span>Grup Baru
          </button>
        </div>

        {loadingG && (
          <div className="py-16 text-center text-slate-400">
            <span className="material-symbols-outlined text-3xl animate-spin">progress_activity</span>
            <p className="text-sm mt-2">Memuat grup opsi...</p>
          </div>
        )}

        {!loadingG && filtered.length === 0 && (
          <div className="border-2 border-dashed border-slate-200 rounded-3xl py-16 text-center">
            <span className="material-symbols-outlined text-4xl text-slate-200">tune</span>
            <p className="text-sm font-bold text-slate-400 mt-2">Belum ada grup opsi</p>
            <p className="text-xs text-slate-400 mt-1">Klik "Grup Baru" untuk membuat template kustomisasi</p>
          </div>
        )}

        <div className="space-y-2.5">
          {filtered.map((g) => {
            const isEditing = editing && !editing.isNew && editing.group.id === g.id
            return (
              <div key={g.id}
                className={`bg-white border rounded-2xl p-4 flex items-center gap-4 hover:shadow-sm transition-all ${isEditing ? 'border-[#124734] ring-1 ring-[#124734]/20' : g.active === false ? 'border-slate-200 opacity-60' : 'border-slate-200/80'}`}>
                <div className="w-10 h-10 rounded-xl bg-[#EAF5EE] text-[#124734] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[20px]">{groupIcon(g)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-sm text-slate-900">{g.label}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${g.type === 'multi' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                      {g.type === 'multi' ? 'Boleh Banyak' : 'Pilih Satu'}
                    </span>
                    {g.required && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Wajib</span>}
                    {g.active === false && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Nonaktif</span>}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    Urutan: {g.order} &nbsp;·&nbsp; Dipakai {usedCount(g.id)} menu &nbsp;·&nbsp;
                    {g.ui === 'note' ? 'Catatan teks bebas' : (g.choices || []).map((c) => c.label).join(', ')}
                  </p>
                </div>
                <button onClick={() => setEditing(isEditing ? null : { isNew: false, group: g })}
                  className={`flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl border transition-all ${isEditing ? 'bg-[#124734] text-white border-[#124734]' : 'border-slate-200 text-slate-700 hover:border-[#124734] hover:text-[#124734]'}`}>
                  <span className="material-symbols-outlined text-[15px]">{isEditing ? 'edit_off' : 'edit'}</span>
                  {isEditing ? 'Tutup' : 'Edit'}
                </button>
              </div>
            )
          })}
        </div>

        {groups.length > 0 && (
          <p className="text-xs text-slate-400 text-center">Menampilkan {filtered.length} dari {groups.length} grup</p>
        )}
      </div>

      {/* Kolom Kanan: Editor */}
      {editing ? (
        <div className="bg-white border border-slate-200/80 rounded-3xl shadow-xs overflow-hidden flex flex-col sticky top-20"
          style={{ maxHeight: 'calc(100vh - 120px)' }}>
          <GroupEditor
            key={editing.isNew ? '__new__' : editing.group.id}
            initial={editing.group}
            isNew={editing.isNew}
            allGroups={groups}
            usedCount={editing.isNew ? 0 : usedCount(editing.group.id)}
            onSave={handleSave}
            onDelete={handleDelete}
            onCancel={() => setEditing(null)}
          />
        </div>
      ) : (
        <div className="hidden lg:flex flex-col items-center justify-center h-64 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl text-center">
          <span className="material-symbols-outlined text-4xl text-slate-200">tune</span>
          <p className="text-sm font-bold text-slate-400 mt-2">Pilih grup untuk diedit</p>
          <p className="text-xs text-slate-400 mt-1">atau klik "Grup Baru"</p>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   PER MENU — MenuOptionsEditor
═══════════════════════════════════════════════════════════════════════ */
function MenuOptionsEditor({ item, groups, onSave, onCancel }) {
  const groupsById  = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups])
  const [customizable, setCustomizable] = useState(() => item.customizable ?? menuGroupIds(item).length > 0)
  const [ids, setIds]           = useState(() => [...menuGroupIds({ ...item, customizable: true })])
  const [overrides, setOverrides] = useState(() => item.optionOverrides || {})
  const [openAccordion, setOpenAccordion] = useState(null)
  const [showAddPanel, setShowAddPanel]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const dragItem  = useRef(null)
  const dragOver  = useRef(null)

  const toggleGroup = (gid) => setIds((p) => (p.includes(gid) ? p.filter((x) => x !== gid) : [...p, gid]))

  function onDragStart(i)  { dragItem.current = i }
  function onDragEnter(i)  { dragOver.current = i }
  function onDragEnd() {
    if (dragItem.current === null || dragOver.current === null || dragItem.current === dragOver.current) return
    setIds((p) => {
      const next = [...p]
      const [moved] = next.splice(dragItem.current, 1)
      next.splice(dragOver.current, 0, moved)
      return next
    })
    dragItem.current = null
    dragOver.current = null
  }

  function move(gid, dir) {
    setIds((p) => {
      const i = p.indexOf(gid)
      const j = i + dir
      if (i < 0 || j < 0 || j >= p.length) return p
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  const setOv = (gid, patch) => setOverrides((p) => ({ ...p, [gid]: { ...(p[gid] || {}), ...patch } }))

  function toggleHidden(gid, cid) {
    const cur = overrides[gid]?.hiddenChoiceIds || []
    setOv(gid, { hiddenChoiceIds: cur.includes(cid) ? cur.filter((x) => x !== cid) : [...cur, cid] })
  }

  async function save() {
    setSaving(true)
    try {
      await onSave(item.id, {
        customizable,
        optionGroupIds: ids,
        optionOverrides: cleanOverrides(ids, overrides, groupsById),
      })
    } catch (err) {
      alert('Gagal menyimpan: ' + err.message)
    } finally { setSaving(false) }
  }

  async function resetOptions() {
    if (!confirm(`Hapus semua pengaturan opsi untuk "${item.name}"? Kembali ke default sistem.`)) return
    setSaving(true)
    try {
      await onSave(item.id, { customizable: false, optionGroupIds: [], optionOverrides: {} })
      onCancel()
    } catch (err) { alert('Gagal menghapus: ' + err.message) }
    finally { setSaving(false) }
  }

  const rest = groups.filter((g) => !ids.includes(g.id))

  return (
    <div className="bg-white border border-slate-200/80 rounded-3xl shadow-xs flex flex-col">
      {/* Header produk */}
      <div className="px-6 pt-5 pb-4 border-b border-slate-100">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-extrabold text-base text-slate-900">Pengaturan Opsi Menu</h2>
          <button onClick={onCancel}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
            <span className="material-symbols-outlined text-[18px] text-slate-500">close</span>
          </button>
        </div>
        <div className="flex items-center gap-3">
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={item.name} className="w-14 h-14 rounded-xl object-cover border border-slate-200/80 shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-[#EAF5EE] text-[#124734] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[26px]">local_cafe</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-extrabold text-slate-900">{item.name}</p>
            {item.desc && <p className="text-xs text-slate-400 mt-0.5 truncate">{item.desc}</p>}
          </div>
          {/* Toggle kustomisasi */}
          <button onClick={() => setCustomizable((p) => !p)}
            className={`flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl border transition-all ${customizable ? 'bg-[#EAF5EE] text-[#124734] border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
            <span className="material-symbols-outlined text-[16px]">{customizable ? 'check_circle' : 'radio_button_unchecked'}</span>
            {customizable ? 'Bisa dikustomisasi' : 'Tanpa kustomisasi'}
          </button>
        </div>
      </div>

      {/* Daftar grup aktif */}
      <div className={`px-6 py-5 space-y-5 ${!customizable ? 'opacity-50 pointer-events-none' : ''}`}>
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-black uppercase tracking-wider text-slate-400">Grup Opsi yang Berlaku</p>
            {ids.length > 0 && (
              <p className="text-[11px] text-slate-400 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">drag_indicator</span>Seret untuk atur urutan
              </p>
            )}
          </div>

          {ids.length === 0 && (
            <div className="border-2 border-dashed border-slate-200 rounded-2xl py-10 text-center">
              <span className="material-symbols-outlined text-3xl text-slate-200">add_circle</span>
              <p className="text-xs text-slate-400 mt-2">Belum ada grup opsi. Klik Tambah di bawah.</p>
            </div>
          )}

          <div className="space-y-2">
            {ids.map((gid, i) => {
              const g      = groupsById.get(gid)
              const isOpen = openAccordion === gid
              const hidden = overrides[gid]?.hiddenChoiceIds || []

              return (
                <div key={gid}
                  draggable onDragStart={() => onDragStart(i)} onDragEnter={() => onDragEnter(i)} onDragEnd={onDragEnd}
                  className="border border-slate-200 rounded-2xl bg-white overflow-hidden transition-shadow hover:shadow-sm cursor-grab active:cursor-grabbing">

                  {/* Accordion header */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="material-symbols-outlined text-[20px] text-slate-300 shrink-0">drag_indicator</span>
                    <div className="w-8 h-8 rounded-lg bg-[#EAF5EE] text-[#124734] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[16px]">{g ? groupIcon(g) : 'help_outline'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900">{g ? g.label : `${gid} (tidak ditemukan)`}</p>
                      {g && (
                        <p className="text-[11px] text-slate-400 truncate">
                          {g.ui === 'note'
                            ? 'Catatan teks bebas'
                            : (g.choices || []).map((c) => c.label).slice(0,3).join(', ') + ((g.choices || []).length > 3 ? '...' : '')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Mobile reorder */}
                      <button type="button" onClick={() => move(gid, -1)} disabled={i === 0}
                        className="w-7 h-7 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center disabled:opacity-30 transition-colors lg:hidden">
                        <span className="material-symbols-outlined text-[14px] text-slate-500">arrow_upward</span>
                      </button>
                      <button type="button" onClick={() => move(gid, 1)} disabled={i === ids.length - 1}
                        className="w-7 h-7 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center disabled:opacity-30 transition-colors lg:hidden">
                        <span className="material-symbols-outlined text-[14px] text-slate-500">arrow_downward</span>
                      </button>
                      {/* Lepas */}
                      <button type="button" onClick={() => { toggleGroup(gid); if (isOpen) setOpenAccordion(null) }}
                        title="Lepas grup ini"
                        className="w-7 h-7 rounded-lg border border-slate-200 hover:bg-red-50 hover:border-red-200 flex items-center justify-center transition-colors">
                        <span className="material-symbols-outlined text-[14px] text-slate-400 hover:text-red-500">link_off</span>
                      </button>
                      {/* Expand */}
                      {g && g.ui !== 'note' && (
                        <button type="button" onClick={() => setOpenAccordion(isOpen ? null : gid)}
                          className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all ${isOpen ? 'bg-[#124734] border-[#124734] text-white' : 'border-slate-200 hover:bg-slate-50 text-slate-400'}`}>
                          <span className={`material-symbols-outlined text-[16px] transition-transform ${isOpen ? 'rotate-180' : ''}`}>expand_more</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Accordion body */}
                  {isOpen && g && g.ui !== 'note' && (
                    <div className="border-t border-slate-100 px-4 py-4 bg-slate-50 space-y-4">
                      {g.type === 'single' && (
                        <div>
                          <label className={labelCls}>Default khusus menu ini</label>
                          <div className="relative">
                            <select value={overrides[gid]?.defaultChoiceId || ''}
                              onChange={(e) => setOv(gid, { defaultChoiceId: e.target.value || null })}
                              className={`${inputCls} appearance-none pr-9`}>
                              <option value="">Ikut template global</option>
                              {(g.choices || []).filter((c) => !hidden.includes(c.id)).map((c) => (
                                <option key={c.id} value={c.id}>{c.label}</option>
                              ))}
                            </select>
                            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">expand_more</span>
                          </div>
                        </div>
                      )}
                      <div>
                        <p className={labelCls}>Sembunyikan pilihan untuk menu ini</p>
                        <div className="flex flex-wrap gap-2">
                          {(g.choices || []).map((c) => {
                            const isHidden = hidden.includes(c.id)
                            return (
                              <button key={c.id} type="button" onClick={() => toggleHidden(gid, c.id)}
                                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all ${isHidden ? 'bg-red-50 text-red-700 border-red-200 line-through' : 'bg-white text-slate-700 border-slate-200 hover:border-[#124734]'}`}>
                                <span className="material-symbols-outlined text-[13px]">{isHidden ? 'visibility_off' : 'visibility'}</span>
                                {c.label}
                                {c.priceDelta > 0 && <span className="text-[10px] opacity-70">+{rupiah(c.priceDelta)}</span>}
                              </button>
                            )
                          })}
                        </div>
                        {hidden.length > 0 && (
                          <p className="text-[11px] text-red-500 mt-1.5">{hidden.length} pilihan disembunyikan untuk menu ini</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Tambah Grup */}
        {customizable && (
          <div>
            <button type="button" onClick={() => setShowAddPanel((p) => !p)}
              className="w-full py-2.5 border-2 border-dashed border-[#124734]/30 text-[#124734] text-sm font-bold rounded-2xl hover:bg-[#EAF5EE] transition-colors flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[18px]">add_circle</span>Tambah Grup Opsi
            </button>
            {showAddPanel && (
              <div className="mt-3 bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <p className="text-xs font-bold text-slate-500 mb-2.5">Pilih grup untuk ditambahkan:</p>
                {rest.length === 0
                  ? <p className="text-xs text-slate-400">Semua grup sudah terpasang.</p>
                  : (
                    <div className="flex flex-wrap gap-2">
                      {rest.map((g) => (
                        <button key={g.id} type="button"
                          onClick={() => { toggleGroup(g.id); setShowAddPanel(false) }}
                          className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-white border border-slate-200 hover:border-[#124734] hover:text-[#124734] transition-colors">
                          <span className="material-symbols-outlined text-[14px]">{groupIcon(g)}</span>
                          {g.label}
                          {g.active === false && <span className="text-[10px] text-slate-400">(nonaktif)</span>}
                        </button>
                      ))}
                    </div>
                  )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-100 flex flex-wrap items-center gap-3">
        <button type="button" onClick={resetOptions} disabled={saving}
          className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
          <span className="material-symbols-outlined text-[15px]">delete</span>Hapus Pengaturan
        </button>
        <div className="flex-1" />
        <button type="button" onClick={onCancel}
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
          Batal
        </button>
        <button type="button" onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#124734] hover:bg-[#0c3124] text-white text-sm font-bold transition-colors disabled:opacity-50 shadow-xs">
          <span className="material-symbols-outlined text-[16px]">save</span>
          {saving ? 'Menyimpan...' : 'Simpan Opsi Menu'}
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   PER MENU — tab wrapper
═══════════════════════════════════════════════════════════════════════ */
function PerMenuTab({ items, groups, loadingM }) {
  const [search, setSearch]                 = useState('')
  const [selectedItemId, setSelectedItemId] = useState(null)
  const groupsById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups])

  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter((i) => (i.name || '').toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q))
  }, [items, search])

  const selectedItem = items.find((i) => i.id === selectedItemId) || null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
      {/* Panel Kiri */}
      <div className="bg-white border border-slate-200/80 rounded-3xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-extrabold text-sm text-slate-900 mb-3">Daftar Menu</h2>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">search</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm placeholder:text-slate-400 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20 transition-all"
              placeholder="Cari menu..." />
          </div>
        </div>

        {loadingM && (
          <div className="py-10 text-center text-slate-400">
            <span className="material-symbols-outlined text-3xl animate-spin">progress_activity</span>
          </div>
        )}

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 240px)' }}>
          {filtered.map((it) => {
            const gids     = menuGroupIds(it)
            const labels   = gids.map((id) => groupsById.get(id)?.label).filter(Boolean)
            const isSel    = selectedItemId === it.id

            return (
              <button key={it.id} onClick={() => setSelectedItemId(it.id)}
                className={`w-full text-left flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors ${isSel ? 'bg-[#EAF5EE] border-l-[3px] border-l-[#124734]' : ''}`}>
                {it.imageUrl ? (
                  <img src={it.imageUrl} alt={it.name} className="w-11 h-11 rounded-xl object-cover border border-slate-200/80 shrink-0" />
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-[#EAF5EE] text-[#124734] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[20px]">local_cafe</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold truncate ${isSel ? 'text-[#124734]' : 'text-slate-900'}`}>{it.name}</p>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {it.customizable === false || gids.length === 0
                      ? 'Tanpa opsi kustomisasi'
                      : labels.slice(0,2).join(' · ') + (labels.length > 2 ? '...' : '')}
                  </p>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-xl transition-colors shrink-0 ${isSel ? 'bg-[#124734] text-white' : 'border border-slate-200 text-slate-500 hover:border-[#124734] hover:text-[#124734]'}`}>
                  Atur opsi
                </span>
              </button>
            )
          })}
          {!loadingM && filtered.length === 0 && (
            <div className="py-10 text-center text-slate-400">
              <span className="material-symbols-outlined text-3xl">search_off</span>
              <p className="text-xs mt-1">Menu tidak ditemukan</p>
            </div>
          )}
        </div>
      </div>

      {/* Panel Kanan */}
      {selectedItem ? (
        <MenuOptionsEditor
          key={selectedItem.id}
          item={selectedItem}
          groups={groups}
          onSave={updateMenuItem}
          onCancel={() => setSelectedItemId(null)}
        />
      ) : (
        <div className="hidden lg:flex flex-col items-center justify-center h-80 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#EAF5EE] text-[#124734] flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-[32px]">settings</span>
          </div>
          <p className="text-sm font-bold text-slate-500">Pilih menu di kiri</p>
          <p className="text-xs text-slate-400 mt-1">untuk mengatur opsi kustomisasinya</p>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   HALAMAN UTAMA
═══════════════════════════════════════════════════════════════════════ */
export default function OptionsAdmin() {
  const [tab, setTab]           = useState('grup')
  const [groups, setGroups]     = useState([])
  const [items, setItems]       = useState([])
  const [loadingG, setLoadingG] = useState(true)
  const [loadingM, setLoadingM] = useState(true)

  useEffect(() => {
    const u1 = listenToOptionGroupsAdmin((d) => { setGroups(d); setLoadingG(false) })
    const u2 = listenToMenuItemsAdmin((d) => { setItems(d.sort((a, b) => (a.name || '').localeCompare(b.name || ''))); setLoadingM(false) })
    return () => { u1(); u2() }
  }, [])

  return (
    <div className="min-h-screen bg-white text-slate-800">
      <TopNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#EAF5EE] text-[#124734] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">tune</span>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Kustom Menu</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Atur opsi kustomisasi minuman dan makanan di outlet Anda.</p>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl gap-1">
            <button onClick={() => setTab('grup')}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === 'grup' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}>
              Template Grup
            </button>
            <button onClick={() => setTab('menu')}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === 'menu' ? 'bg-[#124734] text-white shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}>
              Per Menu
            </button>
          </div>
        </div>

        {/* Empty state alert */}
        {!loadingG && groups.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-5 flex items-start gap-3">
            <span className="material-symbols-outlined text-amber-600 text-[20px] mt-0.5 shrink-0">info</span>
            <p className="text-sm text-amber-800">
              Belum ada template grup opsi. Buka <strong>Kelola Menu → Isi Data Contoh</strong>, atau buat grup sendiri di sini.
            </p>
          </div>
        )}

        {tab === 'grup' && (
          <TemplateGrupTab
            groups={groups}
            loadingG={loadingG}
            items={items}
            onSaveGroup={saveOptionGroup}
            onDeleteGroup={deleteOptionGroup}
          />
        )}

        {tab === 'menu' && (
          <PerMenuTab items={items} groups={groups} loadingM={loadingM} />
        )}
      </main>
    </div>
  )
}
