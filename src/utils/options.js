// Helper MURNI (tanpa efek samping) untuk kustomisasi dinamis.
// Dipakai di Menu, Customize, CartContext, dan validasi order (harus identik di semuanya).
//
// Bentuk "selection" (state pilihan di UI):
//   { [groupId]: string[] }  -> id pilihan untuk grup biasa (single = 1 elemen, multi = banyak)
//   { [groupId]: string }    -> teks bebas untuk grup ui 'note'
//
// Bentuk "selectedOptions" (snapshot yang disimpan di keranjang & order):
//   [{ groupId, groupLabel, choiceId, choiceLabel, priceDelta, summary? }]

// Menu lama (category 'customizable') yang belum punya optionGroupIds
// dibaca memakai grup-grup ini sampai dimigrasi ke Firestore.
export const LEGACY_GROUP_IDS = ['es', 'gula', 'susu', 'topping']

export const getBasePrice = (item) => item?.basePrice ?? item?.price ?? 0

// ---------- resolve ----------

function pickDefault(group, override, choices) {
  if (group.type !== 'single' || group.ui === 'note') return null
  const wanted = override.defaultChoiceId ?? group.defaultChoiceId
  const hit = choices.find((c) => c.id === wanted && c.available)
  if (hit) return hit.id
  if (group.required) return choices.find((c) => c.available)?.id ?? null
  return null
}

// Menggabungkan optionGroupIds (urutan tampil) + optionOverrides.
// Hasil kosong = menu tanpa opsi. showIf TIDAK dievaluasi di sini
// (itu bergantung pada pilihan user), jadi `.length > 0` aman dipakai untuk percabangan.
export function resolveOptions(item, groups = []) {
  if (!item || item.customizable === false) return []

  let ids = Array.isArray(item.optionGroupIds) ? item.optionGroupIds : null
  if (!ids) {
    if (item.category === 'classic' || item.category === 'coffee') {
      ids = ['gula', 'es', 'catatan']
    } else {
      ids = ['gula', 'es', 'topping', 'catatan']
    }
  }

  const byId = new Map(groups.map((g) => [g.id, g]))
  const overrides = item.optionOverrides ?? {}
  const out = []

  for (const gid of ids) {
    const g = byId.get(gid)
    if (!g || g.active === false) continue
    const ov = overrides[gid] ?? {}
    const hidden = new Set(ov.hiddenChoiceIds ?? [])
    const choices = (g.choices ?? [])
      .filter((c) => !hidden.has(c.id))
      .map((c) => ({ ...c, priceDelta: c.priceDelta ?? 0, available: c.available !== false }))
    if (g.ui !== 'note' && choices.length === 0) continue
    out.push({
      ...g,
      required: !!g.required,
      choices,
      defaultChoiceId: pickDefault(g, ov, choices),
    })
  }
  return out
}

// ---------- selection ----------

export function isGroupVisible(group, selection) {
  if (!group.showIf) return true
  const picked = selection[group.showIf.groupId]
  return Array.isArray(picked) && picked.some((id) => group.showIf.choiceIds.includes(id))
}

// Menjaga selection tetap konsisten: grup tersembunyi dibuang,
// grup yang baru muncul diberi default, pilihan lama dipertahankan.
// Panggil dengan {} untuk mendapat default awal.
export function normalizeSelection(resolved, selection = {}) {
  const next = {}
  for (const g of resolved) {
    if (!isGroupVisible(g, next)) continue
    if (g.ui === 'note') {
      next[g.id] = typeof selection[g.id] === 'string' ? selection[g.id] : ''
    } else if (Array.isArray(selection[g.id])) {
      next[g.id] = selection[g.id]
    } else {
      next[g.id] = g.defaultChoiceId ? [g.defaultChoiceId] : []
    }
  }
  return next
}

// ---------- validasi ----------

export function validateSelection(resolved, selection) {
  const errors = []
  for (const g of resolved) {
    if (!isGroupVisible(g, selection)) continue

    if (g.ui === 'note') {
      const text = (selection[g.id] ?? '').trim()
      if (g.required && !text) errors.push({ groupId: g.id, message: `${g.label} wajib diisi` })
      continue
    }

    const picked = Array.isArray(selection[g.id]) ? selection[g.id] : []
    const min = Math.max(g.min ?? 0, g.required ? 1 : 0)
    const max = g.type === 'single' ? 1 : g.max ?? Infinity

    for (const id of picked) {
      const c = g.choices.find((x) => x.id === id)
      if (!c) errors.push({ groupId: g.id, message: `Pilihan ${g.label} tidak dikenal` })
      else if (!c.available) errors.push({ groupId: g.id, message: `${c.label} sedang habis` })
    }
    if (picked.length < min) errors.push({ groupId: g.id, message: `Pilih ${g.label}` })
    if (picked.length > max) errors.push({ groupId: g.id, message: `${g.label}: maksimal ${max} pilihan` })
  }
  return { valid: errors.length === 0, errors }
}

// ---------- snapshot, harga, tampilan ----------

export function buildSelectedOptions(resolved, selection) {
  const out = []
  for (const g of resolved) {
    if (!isGroupVisible(g, selection)) continue

    if (g.ui === 'note') {
      const text = (selection[g.id] ?? '').trim()
      if (text) {
        out.push({
          groupId: g.id,
          groupLabel: g.label,
          choiceId: 'note',
          choiceLabel: text,
          priceDelta: 0,
          summary: `${g.label}: ${text}`,
        })
      }
      continue
    }

    for (const id of selection[g.id] ?? []) {
      const c = g.choices.find((x) => x.id === id)
      if (!c) continue
      out.push({
        groupId: g.id,
        groupLabel: g.label,
        choiceId: c.id,
        choiceLabel: c.label,
        priceDelta: c.priceDelta,
        ...(c.summary ? { summary: c.summary } : {}),
      })
    }
  }
  return out
}

// Harga satuan = harga dasar + Σ priceDelta. (Total baris = ini × qty.)
export function computeUnitPrice(item, selectedOptions = []) {
  return getBasePrice(item) + selectedOptions.reduce((s, o) => s + (o.priceDelta ?? 0), 0)
}

// "Es Sedikit · Gula 50%" — membaca SNAPSHOT, bukan definisi grup terbaru.
export function formatOptions(selectedOptions = []) {
  return selectedOptions.map((o) => o.summary ?? o.choiceLabel).join(' · ')
}

// Identitas baris keranjang: itemId + pilihan terurut.
// Sengaja memakai string kunci langsung (bukan hash) supaya tidak mungkin bertabrakan.
export function lineKey(itemId, selectedOptions = []) {
  const parts = selectedOptions
    .map((o) => `${o.groupId}:${o.choiceId}${o.choiceId === 'note' ? `=${o.choiceLabel}` : ''}`)
    .sort()
  return `${itemId}__${parts.join('|')}`
}

// Teks opsi untuk satu item keranjang/order di semua layar.
// Order BARU memakai snapshot `selectedOptions`; order LAMA (sebelum kustomisasi dinamis)
// masih punya `detail` { base, sweetness, ice, milk, toppings[] } dan tetap terbaca.
export function formatItemOptions(item) {
  if (Array.isArray(item?.selectedOptions) && item.selectedOptions.length > 0) {
    return formatOptions(item.selectedOptions)
  }
  const d = item?.detail
  if (d && typeof d === 'object') {
    return [d.base, d.sweetness, d.ice, d.milk, d.toppings?.length ? d.toppings.join(', ') : null]
      .filter(Boolean)
      .join(' · ')
  }
  return ''
}
