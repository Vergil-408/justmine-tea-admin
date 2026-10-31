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
import { seedOptionGroups } from '../data/seedOptionGroups.js'

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

// Deteksi apakah kategori merupakan makanan / snack / dessert / main course
export function isFoodCategory(catOrItem) {
  if (!catOrItem) return false
  if (typeof catOrItem === 'object') {
    if (catOrItem.itemType === 'food') return true
    if (catOrItem.itemType === 'drink') return false
    return isFoodCategory(catOrItem.category) || isFoodCategory(catOrItem.name)
  }
  const cat = String(catOrItem).toLowerCase().trim()
  const foodKeywords = [
    'food', 'makan', 'snack', 'sweet', 'pastry', 'bakery', 'dessert',
    'main', 'course', 'bites', 'meal', 'dish', 'cake', 'toast', 'roti',
    'nasi', 'mie', 'noodle', 'rice', 'appetizer', 'side', 'dimsum', 'finger',
    'goreng', 'panggang', 'bakso', 'ayam', 'daging', 'sate', 'platter', 'fries'
  ]
  return foodKeywords.some((kw) => cat.includes(kw))
}

// Deteksi apakah kategori teh signature / classic / coffee (tanpa topping)
export function isSignatureCategory(catRaw) {
  if (!catRaw) return false
  const cat = String(catRaw).toLowerCase().trim()
  const sigKeywords = ['signature', 'classic', 'original', 'coffee', 'kopi', 'pure', 'artisanal']
  return sigKeywords.some((kw) => cat.includes(kw))
}

// Menggabungkan optionGroupIds (urutan tampil) + optionOverrides.
// Hasil selalu memiliki fallback grup jika groups dari firestore belum termuat / kosong.
export function resolveOptions(item, groups = []) {
  if (!item || item.customizable === false) return []

  const effectiveGroups = groups && groups.length > 0 ? groups : seedOptionGroups

  const isFood = isFoodCategory(item)
  const isSignature = isSignatureCategory(item.category)

  let ids = Array.isArray(item.optionGroupIds) && item.optionGroupIds.length > 0 ? item.optionGroupIds : null
  if (!ids) {
    if (isFood) {
      ids = ['catatan']
    } else if (isSignature) {
      ids = ['gula', 'es', 'catatan']
    } else {
      ids = ['gula', 'es', 'topping', 'catatan']
    }
  } else {
    // Pastikan aturan kategori selalu dipatuhi
    if (isFood) {
      ids = ids.filter((id) => id === 'catatan')
    } else if (isSignature) {
      ids = ids.filter((id) => id !== 'topping' && id !== 'topping_tea')
    }
  }

  const byId = new Map(effectiveGroups.map((g) => [g.id, g]))
  const fallbackById = new Map(seedOptionGroups.map((g) => [g.id, g]))
  const overrides = item.optionOverrides ?? {}
  const out = []

  for (const gid of ids) {
    const g = byId.get(gid) || fallbackById.get(gid)
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

// Identitas baris keranjang: itemId + pilihan terurut (atau kombinasi slot untuk paket bundling).
// Sengaja memakai string kunci langsung (bukan hash) supaya tidak mungkin bertabrakan.
export function lineKey(itemId, selectedOptions = [], bundleSlots = null) {
  if (bundleSlots && Array.isArray(bundleSlots)) {
    const slotKey = bundleSlots
      .map(
        (s) =>
          `${s.slotId}:${s.menuId}:${s.sugar || ''}:${s.ice || ''}:${s.topping || ''}:${s.note || ''}`
      )
      .join('|')
    return `${itemId}__bundle__${slotKey}`
  }
  const parts = selectedOptions
    .map((o) => `${o.groupId}:${o.choiceId}${o.choiceId === 'note' ? `=${o.choiceLabel}` : ''}`)
    .sort()
  return `${itemId}__${parts.join('|')}`
}

// Teks opsi untuk satu item keranjang/order di semua layar.
// Order BARU memakai snapshot `selectedOptions` atau `bundleSlots`; order LAMA masih punya `detail`.
export function formatItemOptions(item) {
  if (item?.isBundle && Array.isArray(item.bundleSlots)) {
    return item.bundleSlots
      .map((s, idx) => {
        const title = s.drinkName || `Cup ${idx + 1}`
        const opts = [s.sugarLabel, s.iceLabel, s.toppingLabel, s.note ? `"${s.note}"` : null].filter(Boolean)
        return opts.length > 0 ? `${title} (${opts.join(', ')})` : title
      })
      .join(' • ')
  }
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

// Mengekstrak rincian kustomisasi item (kadar es, tingkat manis, topping/add-on, catatan)
// menjadi daftar badge rapi dengan icon & styling yang mudah dibaca barista/kasir.
export function getItemCustomizationDetails(item) {
  if (!item) return []

  const badges = []
  const formatRp = (n) => `Rp${Number(n || 0).toLocaleString('id-ID')}`

  // 1. Snapshot selectedOptions (Struktur standar modern)
  if (Array.isArray(item.selectedOptions) && item.selectedOptions.length > 0) {
    for (const opt of item.selectedOptions) {
      if (!opt) continue
      const gid = (opt.groupId || '').toLowerCase()
      const glabel = (opt.groupLabel || '').toLowerCase()
      const cid = (opt.choiceId || '').toLowerCase()
      const clabel = opt.choiceLabel || opt.summary || ''
      const rawText = (opt.summary || clabel || '').trim()
      if (!rawText) continue

      if (
        gid === 'es' ||
        gid.includes('ice') ||
        glabel.includes('es') ||
        glabel.includes('ice') ||
        cid.includes('ice')
      ) {
        badges.push({
          type: 'ice',
          label: clabel || rawText,
          icon: 'ac_unit',
          bgClass: 'bg-sky-50 text-sky-800 border-sky-200/80',
          iconColor: 'text-sky-600',
        })
      } else if (
        gid === 'gula' ||
        gid.includes('sugar') ||
        glabel.includes('gula') ||
        glabel.includes('manis') ||
        glabel.includes('sugar') ||
        cid.includes('sugar')
      ) {
        badges.push({
          type: 'sugar',
          label: clabel || rawText,
          icon: 'water_drop',
          bgClass: 'bg-amber-50 text-amber-800 border-amber-200/80',
          iconColor: 'text-amber-600',
        })
      } else if (
        gid === 'topping' ||
        gid.includes('addon') ||
        glabel.includes('topping') ||
        glabel.includes('add-on') ||
        glabel.includes('tambahan')
      ) {
        const delta = opt.priceDelta ? ` (+${formatRp(opt.priceDelta)})` : ''
        badges.push({
          type: 'topping',
          label: `${clabel}${delta}`,
          icon: 'add_circle',
          bgClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/80 font-semibold',
          iconColor: 'text-emerald-600',
        })
      } else if (
        gid === 'catatan' ||
        cid === 'note' ||
        glabel.includes('catatan') ||
        glabel.includes('note')
      ) {
        badges.push({
          type: 'note',
          label: clabel || rawText,
          icon: 'edit_note',
          bgClass: 'bg-amber-50 text-amber-900 border-amber-300 italic font-medium',
          iconColor: 'text-amber-700',
        })
      } else if (
        gid === 'susu' ||
        glabel.includes('susu') ||
        glabel.includes('milk')
      ) {
        badges.push({
          type: 'milk',
          label: clabel || rawText,
          icon: 'local_cafe',
          bgClass: 'bg-indigo-50 text-indigo-800 border-indigo-200/80',
          iconColor: 'text-indigo-600',
        })
      } else {
        badges.push({
          type: 'other',
          label: rawText,
          icon: 'tune',
          bgClass: 'bg-surface-muted text-ink-muted border-border',
          iconColor: 'text-ink-muted',
        })
      }
    }
    return badges
  }

  // 2. Format legacy/objek "detail"
  const d = item.detail
  if (d && typeof d === 'object') {
    if (d.ice) {
      badges.push({
        type: 'ice',
        label: d.ice,
        icon: 'ac_unit',
        bgClass: 'bg-sky-50 text-sky-800 border-sky-200/80',
        iconColor: 'text-sky-600',
      })
    }
    if (d.sweetness) {
      badges.push({
        type: 'sugar',
        label: d.sweetness,
        icon: 'water_drop',
        bgClass: 'bg-amber-50 text-amber-800 border-amber-200/80',
        iconColor: 'text-amber-600',
      })
    }
    if (d.milk) {
      badges.push({
        type: 'milk',
        label: d.milk,
        icon: 'local_cafe',
        bgClass: 'bg-indigo-50 text-indigo-800 border-indigo-200/80',
        iconColor: 'text-indigo-600',
      })
    }
    if (Array.isArray(d.toppings)) {
      d.toppings.forEach((top) => {
        if (top) {
          badges.push({
            type: 'topping',
            label: top,
            icon: 'add_circle',
            bgClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/80 font-semibold',
            iconColor: 'text-emerald-600',
          })
        }
      })
    } else if (typeof d.toppings === 'string' && d.toppings.trim()) {
      badges.push({
        type: 'topping',
        label: d.toppings.trim(),
        icon: 'add_circle',
        bgClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/80 font-semibold',
        iconColor: 'text-emerald-600',
      })
    }
    if (d.note) {
      badges.push({
        type: 'note',
        label: d.note,
        icon: 'edit_note',
        bgClass: 'bg-amber-50 text-amber-900 border-amber-300 italic font-medium',
        iconColor: 'text-amber-700',
      })
    }
    if (badges.length > 0) return badges
  }

  // 3. Properti langsung pada item (iceLevel, sugarLevel, toppings, note)
  const ice = item.iceLevel || item.ice
  if (ice && typeof ice === 'string' && ice.trim()) {
    badges.push({
      type: 'ice',
      label: ice.trim(),
      icon: 'ac_unit',
      bgClass: 'bg-sky-50 text-sky-800 border-sky-200/80',
      iconColor: 'text-sky-600',
    })
  }

  const sugar = item.sugarLevel || item.sweetness || item.sugar
  if (sugar && typeof sugar === 'string' && sugar.trim()) {
    badges.push({
      type: 'sugar',
      label: sugar.trim(),
      icon: 'water_drop',
      bgClass: 'bg-amber-50 text-amber-800 border-amber-200/80',
      iconColor: 'text-amber-600',
    })
  }

  const toppings = item.toppings || item.addons || item.topping
  if (Array.isArray(toppings)) {
    toppings.forEach((t) => {
      const name = typeof t === 'object' ? (t.label || t.name) : t
      if (name && typeof name === 'string' && name.trim()) {
        badges.push({
          type: 'topping',
          label: name.trim(),
          icon: 'add_circle',
          bgClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/80 font-semibold',
          iconColor: 'text-emerald-600',
        })
      }
    })
  } else if (typeof toppings === 'string' && toppings.trim()) {
    toppings.split(',').forEach((t) => {
      const trimmed = t.trim()
      if (trimmed) {
        badges.push({
          type: 'topping',
          label: trimmed,
          icon: 'add_circle',
          bgClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/80 font-semibold',
          iconColor: 'text-emerald-600',
        })
      }
    })
  }

  const note = item.note || item.notes || item.catatan
  if (note && typeof note === 'string' && note.trim()) {
    badges.push({
      type: 'note',
      label: note.trim(),
      icon: 'edit_note',
      bgClass: 'bg-amber-50 text-amber-900 border-amber-300 italic font-medium',
      iconColor: 'text-amber-700',
    })
  }

  if (badges.length > 0) return badges

  // 4. Array customizations atau options generik
  const customList = Array.isArray(item.customizations)
    ? item.customizations
    : Array.isArray(item.options)
    ? item.options
    : null

  if (customList && customList.length > 0) {
    customList.forEach((c) => {
      const text = typeof c === 'object' ? (c.label || c.name || c.value || '') : String(c)
      const trimmed = text.trim()
      if (!trimmed) return
      const lower = trimmed.toLowerCase()
      if (lower.includes('es') || lower.includes('ice')) {
        badges.push({
          type: 'ice',
          label: trimmed,
          icon: 'ac_unit',
          bgClass: 'bg-sky-50 text-sky-800 border-sky-200/80',
          iconColor: 'text-sky-600',
        })
      } else if (
        lower.includes('gula') ||
        lower.includes('manis') ||
        lower.includes('sugar') ||
        lower.includes('%')
      ) {
        badges.push({
          type: 'sugar',
          label: trimmed,
          icon: 'water_drop',
          bgClass: 'bg-amber-50 text-amber-800 border-amber-200/80',
          iconColor: 'text-amber-600',
        })
      } else if (
        lower.includes('topping') ||
        lower.includes('boba') ||
        lower.includes('pearl') ||
        lower.includes('jelly') ||
        lower.includes('nata') ||
        lower.includes('aloe') ||
        lower.includes('pudding')
      ) {
        badges.push({
          type: 'topping',
          label: trimmed,
          icon: 'add_circle',
          bgClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/80 font-semibold',
          iconColor: 'text-emerald-600',
        })
      } else if (lower.includes('catatan') || lower.includes('note')) {
        badges.push({
          type: 'note',
          label: trimmed,
          icon: 'edit_note',
          bgClass: 'bg-amber-50 text-amber-900 border-amber-300 italic font-medium',
          iconColor: 'text-amber-700',
        })
      } else {
        badges.push({
          type: 'other',
          label: trimmed,
          icon: 'tune',
          bgClass: 'bg-surface-muted text-ink-muted border-border',
          iconColor: 'text-ink-muted',
        })
      }
    })
    if (badges.length > 0) return badges
  }

  // 5. Fallback dari pemecahan formatItemOptions string (mis. "Es Sedikit · Gula 50% · Boba")
  const fallbackStr = formatItemOptions(item)
  if (fallbackStr && typeof fallbackStr === 'string') {
    const parts = fallbackStr
      .split(/[·•]/)
      .map((s) => s.trim())
      .filter(Boolean)

    parts.forEach((p) => {
      const lower = p.toLowerCase()
      if (lower.includes('es') || lower.includes('ice')) {
        badges.push({
          type: 'ice',
          label: p,
          icon: 'ac_unit',
          bgClass: 'bg-sky-50 text-sky-800 border-sky-200/80',
          iconColor: 'text-sky-600',
        })
      } else if (
        lower.includes('gula') ||
        lower.includes('manis') ||
        lower.includes('sugar') ||
        lower.includes('%')
      ) {
        badges.push({
          type: 'sugar',
          label: p,
          icon: 'water_drop',
          bgClass: 'bg-amber-50 text-amber-800 border-amber-200/80',
          iconColor: 'text-amber-600',
        })
      } else if (
        lower.includes('topping') ||
        lower.includes('boba') ||
        lower.includes('pearl') ||
        lower.includes('jelly') ||
        lower.includes('nata') ||
        lower.includes('aloe') ||
        lower.includes('pudding')
      ) {
        badges.push({
          type: 'topping',
          label: p,
          icon: 'add_circle',
          bgClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/80 font-semibold',
          iconColor: 'text-emerald-600',
        })
      } else if (lower.includes('catatan') || lower.includes('note') || p.startsWith('"')) {
        badges.push({
          type: 'note',
          label: p.replace(/^"|"$/g, ''),
          icon: 'edit_note',
          bgClass: 'bg-amber-50 text-amber-900 border-amber-300 italic font-medium',
          iconColor: 'text-amber-700',
        })
      } else {
        badges.push({
          type: 'other',
          label: p,
          icon: 'tune',
          bgClass: 'bg-surface-muted text-ink-muted border-border',
          iconColor: 'text-ink-muted',
        })
      }
    })
  }

  // 6. Default standard badges untuk menu minuman jika belum memiliki kustomisasi khusus di database
  const isFood = isFoodCategory(item)

  if (badges.length === 0 && !item?.isBundle && !isFood) {
    badges.push({
      type: 'ice',
      label: 'Normal Ice',
      icon: 'ac_unit',
      bgClass: 'bg-sky-50 text-sky-800 border-sky-200/80',
      iconColor: 'text-sky-600',
    })
    badges.push({
      type: 'sugar',
      label: 'Normal (100%)',
      icon: 'water_drop',
      bgClass: 'bg-amber-50 text-amber-800 border-amber-200/80',
      iconColor: 'text-amber-600',
    })
  }

  return badges
}




