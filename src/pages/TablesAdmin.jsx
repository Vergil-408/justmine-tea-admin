import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { collection, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../api/firebase.js'
import TopNav from '../components/TopNav.jsx'
import { normalizeBaseUrl } from '../utils/tableQr.js'

const KEY = 'justmine_admin_customer_url'

function loadUrl() {
  try { return window.localStorage.getItem(KEY) || '' } catch { return '' }
}

// Generate 256-bit cryptographically secure random token (64 hex chars)
function generateSecureToken() {
  const bytes = new Uint8Array(32)
  window.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// Hash token dengan SHA-256 sebelum disimpan ke Firestore (token asli tidak pernah disimpan di DB)
async function hashTokenSha256(token) {
  const data = new TextEncoder().encode(token)
  const digest = await window.crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function buildSecureTableUrl(baseUrl, tableNumber, token) {
  const url = new URL(baseUrl)
  url.searchParams.set('table', tableNumber)
  url.searchParams.set('token', token)
  return url.toString()
}

function downloadQrSvgAsPng(tableNumber) {
  const svg = document.getElementById(`qr-svg-${tableNumber}`)
  if (!svg) return
  const serializer = new XMLSerializer()
  const svgStr = serializer.serializeToString(svg)
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 32, 32, 448, 448)
    URL.revokeObjectURL(url)
    const link = document.createElement('a')
    link.download = `QR-Meja-${tableNumber}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }
  img.src = url
}

export default function TablesAdmin() {
  const [urlInput, setUrlInput] = useState(loadUrl)
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [newTableNum, setNewTableNum] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [loadError, setLoadError] = useState('')
  // Token asli hanya disimpan sementara di memori browser admin untuk render/download QR
  const [plainTokens, setPlainTokens] = useState({})

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'tables'),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => String(a.tableNumber || a.id).localeCompare(String(b.tableNumber || b.id), undefined, { numeric: true }))
        setTables(list)
        setLoadError('')
        setLoading(false)
      },
      (err) => {
        console.error('Gagal memuat daftar meja:', err)
        setLoadError(err.message || 'Gagal membaca koleksi meja dari Firestore.')
        setLoading(false)
      }
    )
    return unsub
  }, [])

  const base = normalizeBaseUrl(urlInput)
  const isLocal = base && /localhost|127\.0\.0\.1/.test(base)

  function changeUrl(v) {
    setUrlInput(v)
    try { window.localStorage.setItem(KEY, v) } catch { /* abaikan */ }
  }

  async function handleAddTable(e) {
    e.preventDefault()
    const clean = String(newTableNum || '').trim().toUpperCase()
    if (!/^[A-Za-z0-9-]{1,6}$/.test(clean)) {
      alert('Nomor meja harus 1–6 karakter huruf/angka/strip (misal: 1, 5, A3, VIP-1).')
      return
    }
    setBusyId(clean)
    try {
      const token = generateSecureToken()
      const tokenHash = await hashTokenSha256(token)
      await setDoc(doc(db, 'tables', clean), {
        tableNumber: clean,
        tokenHash,
        tokenStatus: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      setPlainTokens((prev) => ({ ...prev, [clean]: token }))
      setNewTableNum('')
    } catch (err) {
      alert('Gagal menambah meja: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleRegenerateToken(tableItem) {
    const id = tableItem.id
    if (!confirm(`Regenerasi token QR untuk Meja ${id}? QR lama akan langsung tidak berlaku.`)) return
    setBusyId(id)
    try {
      const token = generateSecureToken()
      const tokenHash = await hashTokenSha256(token)
      await updateDoc(doc(db, 'tables', id), {
        tokenHash,
        tokenStatus: 'active',
        updatedAt: serverTimestamp(),
      })
      setPlainTokens((prev) => ({ ...prev, [id]: token }))
    } catch (err) {
      alert('Gagal regenerasi token: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleToggleStatus(tableItem) {
    const id = tableItem.id
    const nextStatus = tableItem.tokenStatus === 'active' ? 'disabled' : 'active'
    setBusyId(id)
    try {
      await updateDoc(doc(db, 'tables', id), {
        tokenStatus: nextStatus,
        updatedAt: serverTimestamp(),
      })
    } catch (err) {
      alert('Gagal mengubah status token: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  const inputCls = 'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20 transition-all'

  return (
    <div className="min-h-screen bg-[#FBFDFB] print:bg-white">
      <div className="print:hidden">
        <TopNav />
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="print:hidden">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#EAF5EE] text-[#124734] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[22px]">qr_code_2</span>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Meja &amp; QR Token</h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Setiap meja memiliki token unik 256-bit (disimpan sebagai hash SHA-256) untuk mencegah manipulasi URL.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={!base || Object.keys(plainTokens).length === 0}
              onClick={() => window.print()}
              className="flex items-center justify-center gap-2 bg-[#124734] hover:bg-[#0c3124] text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-colors disabled:opacity-40 shadow-xs"
            >
              <span className="material-symbols-outlined text-[18px]">print</span>
              Cetak QR Aktif
            </button>
          </div>

          {/* Setting URL & Tambah Meja */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
              <label className="block text-xs font-bold text-slate-700 mb-1.5" htmlFor="cust-url">
                Alamat Customer App <span className="text-slate-400 font-normal">(untuk generate link QR)</span>
              </label>
              <input
                id="cust-url"
                value={urlInput}
                onChange={(e) => changeUrl(e.target.value)}
                placeholder="https://nama-app.vercel.app"
                className={inputCls}
              />
              {isLocal && (
                <p className="text-[11px] text-amber-700 mt-2">
                  Alamat localhost tidak bisa dibuka dari HP pelanggan. Gunakan alamat Vercel saat mencetak QR sungguhan.
                </p>
              )}
            </div>

            <form onSubmit={handleAddTable} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-wrap sm:flex-nowrap items-end gap-3">
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Nomor Meja</label>
                <input
                  value={newTableNum}
                  onChange={(e) => setNewTableNum(e.target.value)}
                  placeholder="Contoh: 1 atau VIP-1"
                  maxLength={6}
                  className={inputCls}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={busyId !== null}
                className="bg-[#124734] hover:bg-[#0c3124] text-white font-bold text-xs px-5 py-3 rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>Tambah Meja</span>
              </button>
            </form>
          </div>
        </div>

        {/* Daftar Meja & QR */}
        {loadError ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-4 text-xs text-red-700 font-semibold">
            Error memuat meja: {loadError}
          </div>
        ) : loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Memuat daftar meja...</div>
        ) : tables.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl px-4 py-12 text-center bg-white">
            <p className="text-sm font-bold text-slate-600">Belum ada meja terdaftar</p>
            <p className="text-xs text-slate-400 mt-1">Tambahkan nomor meja di atas untuk membuat QR Token unik.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2 gap-4">
            {tables.map((t) => {
              const token = plainTokens[t.id]
              const isActive = t.tokenStatus === 'active'
              const qrUrl = base && token ? buildSecureTableUrl(base, t.id, token) : ''

              return (
                <div
                  key={t.id}
                  className="bg-white border border-slate-200/80 rounded-2xl p-5 flex flex-col justify-between shadow-xs break-inside-avoid print:border-black print:shadow-none print:rounded-none"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div>
                        <p className="text-lg font-extrabold text-slate-900">Meja {t.tableNumber || t.id}</p>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold print:hidden ${
                          isActive ? 'bg-[#EAF8F0] text-emerald-700' : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {isActive ? 'Token Aktif' : 'Nonaktif'}
                      </span>
                    </div>

                    {qrUrl ? (
                      <div className="flex flex-col items-center text-center my-2">
                        <div className="bg-white p-2 rounded-xl border border-slate-100">
                          <QRCodeSVG id={`qr-svg-${t.id}`} value={qrUrl} size={150} level="M" />
                        </div>
                        <p className="text-[11px] text-slate-400 mt-2">Scan untuk memesan di Meja {t.tableNumber || t.id}</p>
                      </div>
                    ) : (
                      <div className="my-3 p-4 rounded-xl bg-slate-50 border border-slate-200/70 text-center print:hidden">
                        <p className="text-xs font-semibold text-slate-600">
                          {!base
                            ? 'Isi Alamat Customer App di atas untuk melihat QR.'
                            : 'Token tersimpan aman (hash). Klik Regenerasi untuk membuat & mengunduh QR baru.'}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 mt-2 border-t border-slate-100 flex flex-wrap gap-2 print:hidden">
                    <button
                      type="button"
                      disabled={busyId === t.id}
                      onClick={() => handleRegenerateToken(t)}
                      className="flex-1 py-2 px-3 rounded-xl bg-[#124734] hover:bg-[#0c3124] text-white text-xs font-bold flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[15px]">refresh</span>
                      <span>Regenerasi QR</span>
                    </button>
                    {qrUrl && (
                      <button
                        type="button"
                        onClick={() => downloadQrSvgAsPng(t.id)}
                        className="py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1 transition-colors"
                        title="Unduh QR PNG"
                      >
                        <span className="material-symbols-outlined text-[15px]">download</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyId === t.id}
                      onClick={() => handleToggleStatus(t)}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition-colors disabled:opacity-50 ${
                        isActive
                          ? 'border-red-200 text-red-600 hover:bg-red-50'
                          : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                      }`}
                    >
                      {isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
