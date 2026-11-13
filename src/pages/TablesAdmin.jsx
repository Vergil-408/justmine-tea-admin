import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import TopNav from '../components/TopNav.jsx'
import { buildTableUrl, normalizeBaseUrl, tableLabels } from '../utils/tableQr.js'

const KEY = 'justmine_admin_customer_url'

function loadUrl() {
  try { return window.localStorage.getItem(KEY) || '' } catch { return '' }
}

export default function TablesAdmin() {
  const [urlInput, setUrlInput] = useState(loadUrl)
  const [count, setCount]       = useState(10)

  const base   = normalizeBaseUrl(urlInput)
  const labels = tableLabels(count)

  function changeUrl(v) {
    setUrlInput(v)
    try { window.localStorage.setItem(KEY, v) } catch { /* tidak tersedia */ }
  }

  const isLocal = base && /localhost|127\.0\.0\.1/.test(base)

  const inputCls = 'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#124734] focus:ring-1 focus:ring-[#124734]/20 transition-all'

  return (
    <div className="min-h-screen bg-white print:bg-white">
      <div className="print:hidden">
        <TopNav />
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="print:hidden">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-[#EAF5EE] text-[#124734] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">qr_code_2</span>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Meja &amp; QR</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Cetak QR untuk ditempel di tiap meja. Pelanggan scan langsung membuka menu dengan nomor meja terisi.
              </p>
            </div>
          </div>

          {/* Setting Card */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 mb-6 shadow-xs grid grid-cols-1 sm:grid-cols-[1fr_160px_auto] gap-4 items-end">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5" htmlFor="cust-url">
                Alamat Customer App <span className="text-slate-400 font-normal">(yang dibuka pelanggan)</span>
              </label>
              <input
                id="cust-url"
                value={urlInput}
                onChange={(e) => changeUrl(e.target.value)}
                placeholder="https://nama-app.vercel.app"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5" htmlFor="count">
                Jumlah Meja <span className="text-slate-400 font-normal">(1–100)</span>
              </label>
              <input
                id="count"
                type="number"
                min="1"
                max="100"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className={inputCls}
              />
            </div>
            <button
              type="button"
              disabled={!base}
              onClick={() => window.print()}
              className="flex items-center justify-center gap-2 bg-[#124734] hover:bg-[#0c3124] text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-colors disabled:opacity-40 shadow-xs"
            >
              <span className="material-symbols-outlined text-[18px]">print</span>
              Cetak
            </button>
          </div>

          {/* Alerts */}
          {urlInput && !base && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5">
              <span className="material-symbols-outlined text-red-500 text-[18px] mt-0.5 shrink-0">error</span>
              <p className="text-xs font-semibold text-red-700">
                Alamat tidak valid. Tulis lengkap dengan <code className="font-mono bg-red-100 px-1 rounded">https://</code>, misalnya <code className="font-mono bg-red-100 px-1 rounded">https://nama-app.vercel.app</code>
              </p>
            </div>
          )}
          {isLocal && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
              <span className="material-symbols-outlined text-amber-600 text-[18px] mt-0.5 shrink-0">warning</span>
              <p className="text-xs text-amber-800">
                Alamat <code className="font-mono bg-amber-100 px-1 rounded">localhost</code> tidak bisa dibuka dari HP pelanggan. Gunakan alamat Vercel saat mencetak QR sungguhan.
              </p>
            </div>
          )}
          {!base && !urlInput && (
            <div className="border-2 border-dashed border-slate-200 rounded-2xl px-4 py-14 text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#EAF5EE] text-[#124734] flex items-center justify-center mx-auto mb-3">
                <span className="material-symbols-outlined text-[28px]">qr_code_2</span>
              </div>
              <p className="text-sm font-bold text-slate-500">Isi alamat Customer App di atas</p>
              <p className="text-xs text-slate-400 mt-1">QR untuk semua meja akan muncul di sini</p>
            </div>
          )}
        </div>

        {/* QR Grid */}
        {base && (
          <div className="grid grid-cols-2 sm:grid-cols-3 print:grid-cols-2 gap-4">
            {labels.map((t) => {
              const url = buildTableUrl(base, t)
              return (
                <div key={t}
                  className="bg-white border border-slate-200/80 rounded-2xl p-5 flex flex-col items-center text-center shadow-xs hover:shadow-md transition-shadow break-inside-avoid print:border-black print:shadow-none print:rounded-none">
                  <p className="text-xs font-bold text-[#124734] tracking-wide mb-1">Justmine Tea</p>
                  <div className="bg-white p-2 my-2 rounded-xl border border-slate-100">
                    <QRCodeSVG value={url} size={160} level="M" />
                  </div>
                  <p className="text-2xl font-extrabold text-slate-900 tracking-tight">Meja {t}</p>
                  <p className="text-[11px] text-slate-400 mt-1">Scan untuk melihat menu &amp; memesan</p>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
