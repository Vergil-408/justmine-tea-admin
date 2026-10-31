import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAdminAuth } from '../context/AdminAuthContext.jsx'
import { ROLE_LABEL } from '../utils/adminRoles.js'
import { loadSoundPref, saveSoundPref } from '../hooks/useOrderAlerts.js'
import { playChime, unlockAudio } from '../utils/chime.js'

export default function TopNav() {
  const { logout, user, role, isOwner } = useAdminAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [soundOn, setSoundOn] = useState(loadSoundPref)
  const [currentTime, setCurrentTime] = useState(() => new Date())

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const handleToggleSound = () => {
    const next = !soundOn
    setSoundOn(next)
    saveSoundPref(next)
    if (next) {
      unlockAudio()
      playChime()
    }
  }

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
      isActive
        ? 'bg-sage text-white shadow-sm'
        : 'text-ink-muted hover:bg-sage-light hover:text-ink'
    }`

  const formattedDate = currentTime.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  const formattedTime = currentTime.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  const navItems = (
    <div className="flex flex-col gap-1 px-3">
      <div className="px-3 pt-3 pb-1.5">
        <span className="text-[10px] uppercase tracking-wider text-ink-muted font-bold">
          Menu Operasional
        </span>
      </div>
      <NavLink
        to="/orders"
        onClick={() => setMobileOpen(false)}
        className={navLinkClass}
      >
        <span className="material-symbols-outlined text-[20px]">view_kanban</span>
        <span>Pesanan (Antrian)</span>
      </NavLink>
      <NavLink
        to="/pos"
        onClick={() => setMobileOpen(false)}
        className={navLinkClass}
      >
        <span className="material-symbols-outlined text-[20px]">point_of_sale</span>
        <span>Kasir (POS)</span>
      </NavLink>

      {isOwner && (
        <>
          <div className="px-3 pt-4 pb-1.5">
            <span className="text-[10px] uppercase tracking-wider text-ink-muted font-bold">
              Manajemen Owner
            </span>
          </div>
          <NavLink
            to="/menu"
            onClick={() => setMobileOpen(false)}
            className={navLinkClass}
          >
            <span className="material-symbols-outlined text-[20px]">emoji_food_beverage</span>
            <span>Kelola Menu</span>
          </NavLink>
          <NavLink
            to="/kustom"
            onClick={() => setMobileOpen(false)}
            className={navLinkClass}
          >
            <span className="material-symbols-outlined text-[20px]">tune</span>
            <span>Kustom Menu</span>
          </NavLink>
          <NavLink
            to="/meja"
            onClick={() => setMobileOpen(false)}
            className={navLinkClass}
          >
            <span className="material-symbols-outlined text-[20px]">qr_code_2</span>
            <span>Meja &amp; QR</span>
          </NavLink>
          <NavLink
            to="/admins"
            onClick={() => setMobileOpen(false)}
            className={navLinkClass}
          >
            <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
            <span>Kelola Admin</span>
          </NavLink>
        </>
      )}
    </div>
  )

  const brandHeader = (
    <div className="p-4 flex items-center gap-3 border-b border-border bg-surface">
      <img
        src="/icon.png"
        alt="Justmine Tea"
        className="w-10 h-10 rounded-xl object-cover shrink-0 shadow-xs border border-border bg-white"
      />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-sm text-ink tracking-tight truncate block">
            Justmine Tea
          </span>
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sage opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-sage"></span>
          </span>
        </div>
        <p className="text-[11px] text-ink-muted truncate">Atelier &amp; Kasir #01</p>
      </div>
    </div>
  )

  const sidebarFooter = (
    <div className="p-3 m-3 rounded-2xl border border-border bg-surface flex items-center gap-3">
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className="w-9 h-9 rounded-full bg-sage text-white font-bold text-sm flex items-center justify-center select-none">
          {(user?.displayName || user?.email || 'A').charAt(0).toUpperCase()}
        </div>
        {/* Online dot */}
        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-surface" />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-ink truncate leading-tight">
          {user?.displayName || user?.email?.split('@')[0] || 'Admin'}
        </p>
        <span className={`inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
          isOwner ? 'bg-amber-100 text-amber-800' : 'bg-sage-light text-sage-dark'
        }`}>
          <span className="material-symbols-outlined text-[11px]">
            {isOwner ? 'star' : 'badge'}
          </span>
          {ROLE_LABEL[role] || (isOwner ? 'Owner' : 'Kasir')}
        </span>
      </div>

      {/* Logout shortcut */}
      <button
        onClick={logout}
        title="Keluar"
        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:text-danger hover:bg-red-50 transition-colors"
      >
        <span className="material-symbols-outlined text-[18px]">logout</span>
      </button>
    </div>
  )

  return (
    <>
      <style>{`
        @media (min-width: 1024px) {
          body {
            padding-left: 16rem;
          }
        }
        @media print {
          body {
            padding-left: 0 !important;
          }
        }
      `}</style>

      {/* Desktop Fixed Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-surface border-r border-border z-40 hidden lg:flex flex-col justify-between print:hidden shadow-sm">
        <div className="flex flex-col">
          {brandHeader}
          <nav className="mt-2 overflow-y-auto max-h-[calc(100vh-210px)] custom-scrollbar">
            {navItems}
          </nav>
        </div>
        <div>
          {sidebarFooter}
        </div>
      </aside>

      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-ink/40 backdrop-blur-xs z-50 lg:hidden print:hidden transition-opacity"
        />
      )}

      {/* Mobile Drawer Content */}
      <aside
        className={`fixed left-0 top-0 bottom-0 w-72 bg-surface z-50 lg:hidden flex flex-col justify-between shadow-2xl transition-transform duration-200 print:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col">
          <div className="flex items-center justify-between pr-3">
            {brandHeader}
            <button
              onClick={() => setMobileOpen(false)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-ink-muted hover:bg-surface-muted"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
          <nav className="mt-2 overflow-y-auto max-h-[calc(100vh-220px)]">
            {navItems}
          </nav>
        </div>
        <div>
          {sidebarFooter}
        </div>
      </aside>

      {/* Sticky Top Header Bar */}
      <header className="fixed top-0 left-0 right-0 lg:left-64 h-16 bg-surface/90 backdrop-blur-md border-b border-border z-30 flex items-center justify-between px-4 sm:px-6 print:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Buka menu navigasi"
            className="lg:hidden w-10 h-10 -ml-1 rounded-xl flex items-center justify-center text-ink hover:bg-surface-muted"
          >
            <span className="material-symbols-outlined text-[24px]">menu</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sage text-[20px]">storefront</span>
            <span className="font-semibold text-sm text-ink hidden sm:inline">
              Justmine Tea — Atelier &amp; Bar
            </span>
            <span className="text-border hidden sm:inline">•</span>
            <span className="text-xs text-ink-muted bg-surface-muted px-2.5 py-1 rounded-full font-medium">
              Terminal Kasir #01
            </span>
          </div>
        </div>

        {/* Center/Right Control Bar */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Live Date & Clock Pill */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-muted border border-border text-xs text-ink-muted font-medium">
            <span className="material-symbols-outlined text-[16px] text-sage">calendar_today</span>
            <span>{formattedDate}</span>
            <span className="text-border">|</span>
            <span className="font-bold text-ink font-mono">{formattedTime}</span>
          </div>

          {/* Sound Alert Toggle */}
          <button
            onClick={handleToggleSound}
            title={soundOn ? 'Notifikasi Suara Aktif (Klik untuk mute)' : 'Notifikasi Suara Senyap (Klik untuk aktifkan)'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              soundOn
                ? 'bg-sage-light border-sage/30 text-sage-dark hover:bg-sage/20'
                : 'bg-surface-muted border-border text-ink-muted hover:text-ink'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {soundOn ? 'volume_up' : 'volume_off'}
            </span>
            <span className="hidden sm:inline">
              {soundOn ? 'Suara On' : 'Mute'}
            </span>
          </button>

          {/* User Account Info Pill */}
          <div className="flex items-center gap-2 pl-2 border-l border-border">
            <div className="w-8 h-8 rounded-full bg-sage-light text-sage-dark font-bold text-xs flex items-center justify-center shrink-0 border border-sage/20">
              {(user?.displayName || user?.email || 'A').charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:block text-left leading-tight">
              <p className="text-xs font-bold text-ink max-w-[120px] truncate">
                {user?.displayName || user?.email?.split('@')[0]}
              </p>
              <p className="text-[10px] text-ink-muted font-medium">
                {ROLE_LABEL[role] || (isOwner ? 'Owner' : 'Kasir')}
              </p>
            </div>
          </div>

          {/* Logout Button */}
          <button
            onClick={logout}
            title="Keluar dari akun admin"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-ink-muted hover:text-danger hover:bg-red-50 transition-colors ml-1"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </header>

      {/* Spacer pushing page content below the 64px header */}
      <div className="h-16 print:hidden" />
    </>
  )
}