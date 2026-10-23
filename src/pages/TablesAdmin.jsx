import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import TopNav from '../components/TopNav.jsx'
import { buildTableUrl, normalizeBaseUrl, tableLabels } from '../utils/tableQr.js'

const KEY = 'justmine_admin_customer_url'

function loadUrl() {
  try {
    return window.localStorage.getItem(KEY) || ''
  } catch {
    return ''
  }
}

export default function TablesAdmin() {
  const [urlInput, setUrlInput] = useState(loadUrl)
  const [count, setCount] = useState(10)

  const base = normalizeBaseUrl(urlInput)
  const labels = tableLabels(count)

  function changeUrl(v) {
    setUrlInput(v)
    try {
      window.localStorage.setItem(KEY, v)
    } catch {
      /* penyimpanan tidak tersedia: tidak masalah */
    }
  }

  const isLocal = base && /localhost|127\.0\.0\.1/.test(base)

  return (
    <div className="min-h-screen print:bg-white">
      <div className="print:hidden">
        <TopNav />
      </div>

      <main className="max-w-6xl mx-auto px-5 py-6">
        <div className="print:hidden">
          <h1 className="text-xl font-bold mb-1">Meja &amp; QR</h1>
          <p className="text-sm text-ink-muted mb-5">
            Cetak QR untuk ditempel di tiap meja. Pelanggan yang scan langsung membuka menu dengan nomor mejanya terisi.
          </p>

          <div className="bg-surface border border-border rounded-2xl p-5 mb-6 grid grid-cols-1 sm:grid-cols-[1fr_160px_auto] gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1" htmlFor="cust-url">
                Alamat Customer App (yang dibuka pelanggan)
              </label>
              <input
                id="cust-url"
                value={urlInput}
                onChange={(e) => changeUrl(e.target.value)}
                placeholder="https://nama-app.vercel.app"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-sage"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1" htmlFor="count">Jumlah meja (1–100)</label>
              <input
                id="count"
                type="number"
                min="1"
                max="100"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-sage"
              />
            </div>
            <button
              type="button"
              disabled={!base}
              onClick={() => window.print()}
              className="bg-sage text-white font-semibold text-sm px-5 py-2.5 rounded-xl hover:bg-sage-dark transition-colors disabled:opacity-40"
            >
              Cetak
            </button>
          </div>

          {urlInput && !base && (
            <p role="alert" className="text-danger text-xs font-semibold mb-4">
              Alamat tidak valid. Tulis lengkap dengan https://, misalnya https://nama-app.vercel.app
            </p>
          )}
          {isLocal && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4">
              Alamat <code>localhost</code> tidak bisa dibuka dari HP pelanggan. Pakai alamat Vercel saat mencetak QR sungguhan.
            </p>
          )}
          {!base && !urlInput && (
            <p className="text-sm text-ink-muted bg-surface border border-dashed border-border rounded-2xl px-4 py-10 text-center">
              Isi alamat Customer App di atas, lalu QR semua meja muncul di sini.
            </p>
          )}
        </div>

        {base && (
          <div className="grid grid-cols-2 sm:grid-cols-3 print:grid-cols-2 gap-4">
            {labels.map((t) => {
              const url = buildTableUrl(base, t)
              return (
                <div key={t} className="bg-surface border border-border rounded-2xl p-4 flex flex-col items-center text-center break-inside-avoid print:border-black">
                  <p className="text-xs font-semibold text-ink-muted">Justmine Tea</p>
                  <div className="bg-white p-2 my-2">
                    <QRCodeSVG value={url} size={160} level="M" />
                  </div>
                  <p className="text-2xl font-bold">Meja {t}</p>
                  <p className="text-[11px] text-ink-muted mt-1">Scan untuk melihat menu &amp; memesan</p>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
