// Helper murni untuk halaman Kustom Menu (tanpa Firebase, mudah dites).
import { LEGACY_GROUP_IDS } from './options.js'

export const SINGLE_UIS = ['cards', 'segmented', 'slider', 'radio', 'note']
export const UI_LABEL = {
  cards: 'Kartu (ikon)',
  segmented: 'Segmen (tombol sebaris)',
  slider: 'Slider',
  radio: 'Radio (daftar)',
  toppings: 'Topping (centang banyak)',
  note: 'Catatan (teks bebas)',
}

export const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export function uniqueId(base, taken) {
  const root = base || 'pilihan'
  let id = root
  let n = 2
  while (taken.has(id)) id = `${root}-${n++}`
  return id
}

export function emptyGroup(order = 0) {
  return {
    id: '', label: '', type: 'single', ui: 'cards', required: false,
    min: 0, max: 1, defaultChoiceId: null, order, active: true, showIf: null, choices: [],
  }
}

// Id grup yang berlaku untuk satu menu (sama dengan logika resolveOptions, tanpa data grup).
export function menuGroupIds(item) {
  if (!item || item.customizable === false) return []
  if (Array.isArray(item.optionGroupIds)) return item.optionGroupIds
  return item.category === 'customizable' ? LEGACY_GROUP_IDS : []
}

// Draft form -> dokumen siap simpan ke Firestore.
export function cleanGroup(d) {
  const single = d.type === 'single'
  const note = d.ui === 'note'
  const choices = note
    ? []
    : (d.choices || []).map((c) => ({
        id: c.id,
        label: String(c.label || '').trim(),
        ...(c.icon && String(c.icon).trim() ? { icon: String(c.icon).trim() } : {}),
        ...(c.summary && String(c.summary).trim() ? { summary: String(c.summary).trim() } : {}),
        priceDelta: Math.max(0, Math.round(Number(c.priceDelta) || 0)),
        available: c.available !== false,
      }))
  const required = !!d.required
  const min = single ? (required ? 1 : 0) : Math.max(0, Math.round(Number(d.min) || 0))
  const max = single ? 1 : d.max === '' || d.max == null ? null : Math.max(1, Math.round(Number(d.max)))
  const defaultChoiceId =
    single && !note && choices.some((c) => c.id === d.defaultChoiceId) ? d.defaultChoiceId : null
  const showIf =
    d.showIf && d.showIf.groupId && d.showIf.choiceIds?.length
      ? { groupId: d.showIf.groupId, choiceIds: d.showIf.choiceIds }
      : null
  return {
    id: String(d.id || '').trim(),
    label: String(d.label || '').trim(),
    type: single ? 'single' : 'multi',
    ui: single ? d.ui : 'toppings',
    required, min, max, defaultChoiceId,
    order: Math.round(Number(d.order) || 0),
    active: d.active !== false,
    showIf,
    choices,
  }
}

// Mengembalikan daftar pesan error (kosong = valid). `clean` = hasil cleanGroup.
export function validateGroup(clean, allGroups, isNew) {
  const errs = []
  if (!clean.label) errs.push('Nama grup wajib diisi.')
  if (!/^[a-z0-9-]+$/.test(clean.id)) errs.push('Id grup hanya boleh huruf kecil, angka, dan tanda "-".')
  if (isNew && allGroups.some((g) => g.id === clean.id)) errs.push(`Id "${clean.id}" sudah dipakai grup lain.`)
  if (clean.ui !== 'note') {
    if (clean.choices.length === 0) errs.push('Tambahkan minimal satu pilihan.')
    const seen = new Set()
    clean.choices.forEach((c, i) => {
      if (!c.label) errs.push(`Pilihan #${i + 1}: nama wajib diisi.`)
      if (!/^[a-z0-9-]+$/.test(c.id)) errs.push(`Pilihan "${c.label || '#' + (i + 1)}": id tidak valid.`)
      if (seen.has(c.id)) errs.push(`Id pilihan "${c.id}" dobel.`)
      seen.add(c.id)
    })
    if (clean.required && !clean.choices.some((c) => c.available)) {
      errs.push('Grup wajib butuh minimal satu pilihan yang tersedia.')
    }
  }
  if (clean.showIf) {
    const ref = allGroups.find((g) => g.id === clean.showIf.groupId)
    if (!ref || ref.id === clean.id) errs.push('Syarat tampil merujuk ke grup yang tidak valid.')
  }
  return errs
}

// Buang override kosong/usang. `groupsById`: Map id -> grup.
export function cleanOverrides(ids, overrides = {}, groupsById) {
  const out = {}
  for (const gid of ids) {
    const g = groupsById.get(gid)
    const ov = overrides[gid]
    if (!g || !ov) continue
    const valid = new Set((g.choices || []).map((c) => c.id))
    const hidden = (ov.hiddenChoiceIds || []).filter((id) => valid.has(id))
    const def = ov.defaultChoiceId && valid.has(ov.defaultChoiceId) && !hidden.includes(ov.defaultChoiceId)
      ? ov.defaultChoiceId
      : null
    if (def || hidden.length) {
      out[gid] = { ...(def ? { defaultChoiceId: def } : {}), ...(hidden.length ? { hiddenChoiceIds: hidden } : {}) }
    }
  }
  return out
}
