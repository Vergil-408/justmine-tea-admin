// Pembuat alamat QR meja: <alamat Customer App>/?meja=NN
const TABLE_RE = /^[A-Za-z0-9-]{1,6}$/ // sama dengan aturan di Customer App (utils/table.js)

// Hanya https (atau http untuk localhost). Path dan garis miring akhir dibuang.
export function normalizeBaseUrl(input) {
  const s = String(input || '').trim()
  if (!s) return null
  let u
  try {
    u = new URL(s)
  } catch {
    return null
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null
  return u.origin
}

export function buildTableUrl(base, table) {
  const t = String(table).trim().toUpperCase()
  if (!TABLE_RE.test(t)) throw new Error('Nomor meja tidak valid')
  return `${base}/?meja=${encodeURIComponent(t)}`
}

// Meja 1..N (dibatasi 1..100).
export function tableLabels(count) {
  const n = Math.min(100, Math.max(1, Math.floor(Number(count) || 1)))
  return Array.from({ length: n }, (_, i) => String(i + 1))
}
