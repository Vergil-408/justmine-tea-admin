import { useEffect, useMemo, useState } from 'react'
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

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-sage'
const labelCls = 'block text-xs font-semibold text-ink-muted mb-1'
const btnGhost = 'text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-border hover:bg-sage-light'
const rupiah = (n) => `Rp${Number(n || 0).toLocaleString('id-ID')}`

/* ====================== Editor template grup ====================== */

function GroupEditor({ initial, isNew, allGroups, usedCount, onSave, onDelete, onCancel }) {
  const [d, setD] = useState(() => ({
    ...initial,
    max: initial.max ?? '',
    showIf: initial.showIf ?? null,
    choices: (initial.choices || []).map((c) => ({ ...c })),
  }))
  const [idEdited, setIdEdited] = useState(!isNew)
  const [errors, setErrors] = useState([])
  const [saving, setSaving] = useState(false)
  const lockedIds = useMemo(() => new Set(isNew ? [] : (initial.choices || []).map((c) => c.id)), [initial, isNew])

  const set = (patch) => setD((p) => ({ ...p, ...patch }))
  const isSingle = d.type === 'single'
  const isNote = d.ui === 'note'
  const otherGroups = allGroups.filter((g) => g.id !== d.id)

  function setLabel(label) {
    setD((p) => ({ ...p, label, ...(isNew && !idEdited ? { id: slugify(label) } : {}) }))
  }

  function setType(type) {
    setD((p) => ({ ...p, type, ui: type === 'multi' ? 'toppings' : SINGLE_UIS.includes(p.ui) ? p.ui : 'cards' }))
  }

  const setChoice = (i, patch) =>
    setD((p) => ({ ...p, choices: p.choices.map((c, x) => (x === i ? { ...c, ...patch } : c)) }))

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

  const addChoice = () =>
    setD((p) => ({
      ...p,
      choices: [...p.choices, { id: '', label: '', icon: '', summary: '', priceDelta: 0, available: true }],
    }))

  function moveChoice(i, dir) {
    setD((p) => {
      const j = i + dir
      if (j < 0 || j >= p.choices.length) return p
      const next = [...p.choices]
      ;[next[i], next[j]] = [next[j], next[i]]
      return { ...p, choices: next }
    })
  }

  const removeChoice = (i) => setD((p) => ({ ...p, choices: p.choices.filter((_, x) => x !== i) }))

  const showIfRef = d.showIf?.groupId ? allGroups.find((g) => g.id === d.showIf.groupId) : null

  function toggleShowIfChoice(cid) {
    const cur = d.showIf?.choiceIds || []
    const next = cur.includes(cid) ? cur.filter((x) => x !== cid) : [...cur, cid]
    set({ showIf: { groupId: d.showIf.groupId, choiceIds: next } })
  }

  async function submit(e) {
    e.preventDefault()
    const clean = cleanGroup(d)
    const errs = validateGroup(clean, allGroups, isNew)
    setErrors(errs)
    if (errs.length) return
    setSaving(true)
    try {
      await onSave(clean)
    } catch (err) {
      setErrors(['Gagal menyimpan: ' + err.message])
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="bg-surface border border-border rounded-2xl p-5 h-fit">
      <h2 className="font-bold text-sm mb-4">{isNew ? 'Grup Opsi Baru' : `Edit Grup: ${initial.label}`}</h2>

      <label className={labelCls}>Nama grup</label>
      <input value={d.label} onChange={(e) => setLabel(e.target.value)} className={`${inputCls} mb-3`} placeholder="Es" />

      <label className={labelCls}>Id grup {isNew ? '' : '(tidak bisa diubah)'}</label>
      <input
        value={d.id}
        disabled={!isNew}
        onChange={(e) => {
          setIdEdited(true)
          set({ id: e.target.value })
        }}
        className={`${inputCls} mb-3 disabled:opacity-60`}
        placeholder="es"
      />

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className={labelCls}>Jenis pilihan</label>
          <select value={d.type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            <option value="single">Pilih satu</option>
            <option value="multi">Boleh banyak</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Tampilan</label>
          <select value={d.ui} onChange={(e) => set({ ui: e.target.value })} disabled={!isSingle} className={`${inputCls} disabled:opacity-60`}>
            {(isSingle ? SINGLE_UIS : ['toppings']).map((u) => (
              <option key={u} value={u}>{UI_LABEL[u]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!d.required} onChange={(e) => set({ required: e.target.checked })} />
          Wajib diisi
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={d.active !== false} onChange={(e) => set({ active: e.target.checked })} />
          Aktif
        </label>
        <label className="flex items-center gap-2">
          Urutan
          <input
            type="number"
            value={d.order}
            onChange={(e) => set({ order: e.target.value })}
            className="w-16 px-2 py-1 rounded-lg border border-border bg-background text-sm"
          />
        </label>
      </div>

      {!isSingle && (
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className={labelCls}>Minimal dipilih</label>
            <input type="number" min="0" value={d.min ?? 0} onChange={(e) => set({ min: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Maksimal (kosong = bebas)</label>
            <input type="number" min="1" value={d.max} onChange={(e) => set({ max: e.target.value })} className={inputCls} />
          </div>
        </div>
      )}

      {isNote ? (
        <p className="text-xs text-ink-muted bg-background border border-border rounded-lg px-3 py-2 mb-3">
          Grup catatan berupa kotak teks bebas, jadi tidak punya daftar pilihan.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-ink-muted">Pilihan</label>
            <button type="button" onClick={addChoice} className={btnGhost}>+ Tambah pilihan</button>
          </div>

          <div className="flex flex-col gap-2 mb-3">
            {d.choices.length === 0 && <p className="text-xs text-ink-muted">Belum ada pilihan.</p>}
            {d.choices.map((c, i) => (
              <div key={i} className="border border-border rounded-xl p-2.5 bg-background">
                <div className="flex gap-2 mb-2">
                  <input value={c.label} onChange={(e) => setChoiceLabel(i, e.target.value)} className={inputCls} placeholder="Nama pilihan" />
                  <input
                    type="number"
                    min="0"
                    value={c.priceDelta ?? 0}
                    onChange={(e) => setChoice(i, { priceDelta: e.target.value })}
                    className={`${inputCls} w-28`}
                    title="Tambahan harga (Rp)"
                    placeholder="+Rp"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <input
                    value={c.id}
                    disabled={lockedIds.has(c.id)}
                    onChange={(e) => setChoice(i, { id: e.target.value, _idEdited: true })}
                    className={`${inputCls} disabled:opacity-60`}
                    placeholder="id"
                    title={lockedIds.has(c.id) ? 'Id pilihan lama tidak bisa diubah' : 'id pilihan'}
                  />
                  <input value={c.icon || ''} onChange={(e) => setChoice(i, { icon: e.target.value })} className={inputCls} placeholder="ikon" title="Nama Material Symbols, mis. ac_unit" />
                  <input value={c.summary || ''} onChange={(e) => setChoice(i, { summary: e.target.value })} className={inputCls} placeholder="ringkasan" title="Teks di ringkasan pesanan, mis. Gula 50%" />
                </div>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setChoice(i, { available: c.available === false })}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                      c.available === false ? 'bg-red-100 text-red-700 border-red-200' : 'bg-sage-light text-sage-dark border-transparent'
                    }`}
                  >
                    {c.available === false ? 'Habis' : 'Tersedia'}
                  </button>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => moveChoice(i, -1)} className={btnGhost} aria-label="Naikkan">↑</button>
                    <button type="button" onClick={() => moveChoice(i, 1)} className={btnGhost} aria-label="Turunkan">↓</button>
                    <button type="button" onClick={() => removeChoice(i)} className={`${btnGhost} text-danger`} aria-label="Hapus pilihan">✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {isSingle && d.choices.length > 0 && (
            <div className="mb-3">
              <label className={labelCls}>Pilihan default</label>
              <select value={d.defaultChoiceId || ''} onChange={(e) => set({ defaultChoiceId: e.target.value || null })} className={inputCls}>
                <option value="">{d.required ? '(pilihan tersedia pertama)' : '(tidak ada)'}</option>
                {d.choices.filter((c) => c.id).map((c) => (
                  <option key={c.id} value={c.id}>{c.label || c.id}</option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {/* Syarat tampil */}
      <div className="mb-4">
        <label className={labelCls}>Tampilkan hanya jika... (opsional)</label>
        <select
          value={d.showIf?.groupId || ''}
          onChange={(e) => set({ showIf: e.target.value ? { groupId: e.target.value, choiceIds: [] } : null })}
          className={inputCls}
        >
          <option value="">Selalu tampil</option>
          {otherGroups.map((g) => (
            <option key={g.id} value={g.id}>Grup &quot;{g.label}&quot;</option>
          ))}
        </select>
        {showIfRef && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {showIfRef.choices.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={d.showIf.choiceIds.includes(c.id)} onChange={() => toggleShowIfChoice(c.id)} />
                {c.label}
              </label>
            ))}
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <ul className="bg-red-50 border border-red-200 text-danger text-xs rounded-lg px-3 py-2 mb-3 list-disc list-inside">
          {errors.map((m, i) => <li key={i}>{m}</li>)}
        </ul>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="flex-1 bg-sage text-white font-semibold text-sm py-2.5 rounded-xl hover:bg-sage-dark transition-colors disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Simpan Grup'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2.5 rounded-xl border border-border text-sm font-semibold text-ink-muted">
          Tutup
        </button>
      </div>

      {!isNew && (
        <button type="button" onClick={() => onDelete(initial, usedCount)} className="mt-3 text-[11px] text-ink-muted hover:text-danger">
          Hapus grup ini{usedCount > 0 ? ` (dipakai ${usedCount} menu)` : ''}
        </button>
      )}
    </form>
  )
}

/* ====================== Editor opsi per menu ====================== */

function MenuOptionsEditor({ item, groups, onSave, onCancel }) {
  const groupsById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups])
  const [customizable, setCustomizable] = useState(() => item.customizable ?? menuGroupIds(item).length > 0)
  const [ids, setIds] = useState(() => [...menuGroupIds({ ...item, customizable: true })])
  const [overrides, setOverrides] = useState(() => item.optionOverrides || {})
  const [open, setOpen] = useState(null)
  const [saving, setSaving] = useState(false)

  const toggleGroup = (gid) => setIds((p) => (p.includes(gid) ? p.filter((x) => x !== gid) : [...p, gid]))

  function move(gid, dir) {
    setIds((p) => {
      const i = p.indexOf(gid)
      const j = i + dir
      if (i < 0 || j < 0 || j >= p.length) return p
      const next = [...p]
      ;[next[i], next[j]] = [next[j], next[i]]
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
    } finally {
      setSaving(false)
    }
  }

  const rest = groups.filter((g) => !ids.includes(g.id))

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 h-fit">
      <h2 className="font-bold text-sm">Opsi untuk: {item.name}</h2>

      <label className="flex items-center gap-2 mt-3 mb-4 text-sm font-semibold">
        <input type="checkbox" checked={customizable} onChange={(e) => setCustomizable(e.target.checked)} />
        Menu ini bisa dikustomisasi
      </label>

      <div className={customizable ? '' : 'opacity-50 pointer-events-none'}>
        <p className={labelCls}>Grup yang berlaku (urutan = urutan tampil)</p>
        <div className="flex flex-col gap-2 mb-4">
          {ids.map((gid, i) => {
            const g = groupsById.get(gid)
            return (
              <div key={gid} className="border border-border rounded-xl bg-background">
                <div className="flex items-center gap-2 px-3 py-2">
                  <input type="checkbox" checked onChange={() => toggleGroup(gid)} aria-label={`Lepas ${g?.label || gid}`} />
                  <span className="flex-1 text-sm font-semibold">
                    {g ? g.label : `${gid} (grup tidak ditemukan)`}
                    {g && g.active === false && <span className="ml-2 text-[10px] text-ink-muted">nonaktif</span>}
                  </span>
                  {g && g.ui !== 'note' && (
                    <button type="button" onClick={() => setOpen(open === gid ? null : gid)} className={btnGhost}>
                      {open === gid ? 'Tutup' : 'Atur'}
                    </button>
                  )}
                  <button type="button" onClick={() => move(gid, -1)} disabled={i === 0} className={`${btnGhost} disabled:opacity-30`} aria-label="Naikkan">↑</button>
                  <button type="button" onClick={() => move(gid, 1)} disabled={i === ids.length - 1} className={`${btnGhost} disabled:opacity-30`} aria-label="Turunkan">↓</button>
                </div>

                {g && open === gid && (
                  <div className="border-t border-border px-3 py-3">
                    {g.type === 'single' && (
                      <div className="mb-3">
                        <label className={labelCls}>Default khusus menu ini</label>
                        <select
                          value={overrides[gid]?.defaultChoiceId || ''}
                          onChange={(e) => setOv(gid, { defaultChoiceId: e.target.value || null })}
                          className={inputCls}
                        >
                          <option value="">Ikut template</option>
                          {g.choices.filter((c) => !(overrides[gid]?.hiddenChoiceIds || []).includes(c.id)).map((c) => (
                            <option key={c.id} value={c.id}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <p className={labelCls}>Sembunyikan pilihan</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {g.choices.map((c) => (
                        <label key={c.id} className="flex items-center gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            checked={(overrides[gid]?.hiddenChoiceIds || []).includes(c.id)}
                            onChange={() => toggleHidden(gid, c.id)}
                          />
                          {c.label}
                          {c.priceDelta > 0 && <span className="text-ink-muted">(+{rupiah(c.priceDelta)})</span>}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {ids.length === 0 && <p className="text-xs text-ink-muted">Belum ada grup dipilih.</p>}
        </div>

        {rest.length > 0 && (
          <>
            <p className={labelCls}>Tambahkan grup</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {rest.map((g) => (
                <button key={g.id} type="button" onClick={() => toggleGroup(g.id)} className={btnGhost}>
                  + {g.label}
                  {g.active === false ? ' (nonaktif)' : ''}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={saving} className="flex-1 bg-sage text-white font-semibold text-sm py-2.5 rounded-xl hover:bg-sage-dark transition-colors disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Simpan Opsi Menu'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2.5 rounded-xl border border-border text-sm font-semibold text-ink-muted">
          Tutup
        </button>
      </div>
    </div>
  )
}

/* ====================== Halaman ====================== */

export default function OptionsAdmin() {
  const [tab, setTab] = useState('grup')
  const [groups, setGroups] = useState([])
  const [items, setItems] = useState([])
  const [loadingG, setLoadingG] = useState(true)
  const [loadingM, setLoadingM] = useState(true)
  const [editing, setEditing] = useState(null) // { isNew, group }
  const [selectedItemId, setSelectedItemId] = useState(null)

  useEffect(() => {
    const u1 = listenToOptionGroupsAdmin((d) => {
      setGroups(d)
      setLoadingG(false)
    })
    const u2 = listenToMenuItemsAdmin((d) => {
      setItems(d.sort((a, b) => (a.name || '').localeCompare(b.name || '')))
      setLoadingM(false)
    })
    return () => {
      u1()
      u2()
    }
  }, [])

  const usedCount = (gid) => items.filter((it) => menuGroupIds(it).includes(gid)).length
  const selectedItem = items.find((i) => i.id === selectedItemId) || null
  const groupsById = new Map(groups.map((g) => [g.id, g]))

  async function handleSaveGroup(clean) {
    await saveOptionGroup(clean)
    setEditing(null)
  }

  async function handleDeleteGroup(group, used) {
    const warn = used > 0 ? `\n\nGrup ini dipakai ${used} menu. Menu itu tidak lagi menampilkan grup ini.` : ''
    if (!confirm(`Hapus grup "${group.label}"?${warn}\n\nPesanan lama tidak terpengaruh (opsinya sudah tersimpan di pesanan).`)) return
    try {
      await deleteOptionGroup(group.id)
      setEditing(null)
    } catch (err) {
      alert('Gagal menghapus: ' + err.message)
    }
  }

  const tabBtn = (key, label) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
        tab === key ? 'bg-sage text-white' : 'bg-surface border border-border text-ink-muted hover:bg-sage-light'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="min-h-screen">
      <TopNav />

      <main className="max-w-6xl mx-auto px-5 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h1 className="text-xl font-bold">Kustom Menu</h1>
          <div className="flex gap-2">
            {tabBtn('grup', 'Template Grup')}
            {tabBtn('menu', 'Per Menu')}
          </div>
        </div>

        {!loadingG && groups.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-2xl px-4 py-3 mb-5">
            Belum ada template opsi. Buka <strong>Kelola Menu → Isi Data Contoh</strong>, atau buat grup sendiri di sini.
          </div>
        )}

        {tab === 'grup' && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_440px] gap-6">
            <div className="flex flex-col gap-3">
              <button
                onClick={() => setEditing({ isNew: true, group: emptyGroup((groups.at(-1)?.order ?? 0) + 1) })}
                className="self-start text-xs font-semibold px-3 py-2 rounded-full border border-border bg-surface hover:bg-sage-light"
              >
                + Grup baru
              </button>
              {loadingG && <p className="text-ink-muted text-sm">Memuat grup...</p>}
              {groups.map((g) => (
                <div key={g.id} className={`bg-surface border border-border rounded-2xl p-4 flex items-center gap-4 ${g.active === false ? 'opacity-60' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sm">{g.label}</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sage-light text-sage-dark uppercase">
                        {g.type === 'multi' ? 'banyak' : 'satu'} · {g.ui}
                      </span>
                      {g.required && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Wajib</span>}
                      {g.active === false && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">Nonaktif</span>}
                    </div>
                    <p className="text-xs text-ink-muted mt-1 truncate">
                      {g.ui === 'note'
                        ? 'Catatan teks bebas'
                        : (g.choices || []).map((c) => c.label + (c.available === false ? ' (habis)' : '')).join(' · ')}
                    </p>
                    <p className="text-[11px] text-ink-muted mt-0.5">Dipakai {usedCount(g.id)} menu</p>
                  </div>
                  <button onClick={() => setEditing({ isNew: false, group: g })} className={btnGhost}>Edit</button>
                </div>
              ))}
            </div>

            {editing && (
              <GroupEditor
                key={editing.isNew ? 'new' : editing.group.id}
                initial={editing.group}
                isNew={editing.isNew}
                allGroups={groups}
                usedCount={editing.isNew ? 0 : usedCount(editing.group.id)}
                onSave={handleSaveGroup}
                onDelete={handleDeleteGroup}
                onCancel={() => setEditing(null)}
              />
            )}
          </div>
        )}

        {tab === 'menu' && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_440px] gap-6">
            <div className="flex flex-col gap-3">
              {loadingM && <p className="text-ink-muted text-sm">Memuat menu...</p>}
              {items.map((it) => {
                const ids = menuGroupIds(it)
                const labels = ids.map((id) => groupsById.get(id)?.label).filter(Boolean)
                return (
                  <div key={it.id} className={`bg-surface border rounded-2xl p-4 flex items-center gap-4 ${selectedItemId === it.id ? 'border-sage' : 'border-border'}`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm">{it.name}</p>
                      <p className="text-xs text-ink-muted mt-0.5 truncate">
                        {it.customizable === false || ids.length === 0 ? 'Tanpa opsi' : labels.join(' · ')}
                      </p>
                    </div>
                    <button onClick={() => setSelectedItemId(it.id)} className={btnGhost}>Atur opsi</button>
                  </div>
                )
              })}
            </div>

            {selectedItem && (
              <MenuOptionsEditor
                key={selectedItem.id}
                item={selectedItem}
                groups={groups}
                onSave={updateMenuItem}
                onCancel={() => setSelectedItemId(null)}
              />
            )}
          </div>
        )}
      </main>
    </div>
  )
}
