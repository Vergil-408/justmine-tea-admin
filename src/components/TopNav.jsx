import { NavLink } from 'react-router-dom'
import { useAdminAuth } from '../context/AdminAuthContext.jsx'
import { ROLE_LABEL } from '../utils/adminRoles.js'

export default function TopNav() {
  const { logout, user, role, isOwner } = useAdminAuth()

  const linkClass = ({ isActive }) =>
    `px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${isActive ? 'bg-sage text-white' : 'text-ink-muted hover:bg-sage-light'
    }`

  return (
    <header className="sticky top-0 z-20 bg-surface border-b border-border">
      <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-9 h-9 rounded-full bg-sage flex items-center justify-center text-white font-bold">
            차
          </div>
          <div className="leading-tight">
            <p className="font-bold text-sm">Justmine Tea</p>
            <p className="text-[11px] text-ink-muted -mt-0.5">Admin & Kasir</p>
          </div>
        </div>

        <nav className="flex items-center gap-1 bg-background rounded-full p-1 overflow-x-auto">
          <NavLink to="/orders" className={linkClass}>
            Pesanan
          </NavLink>
          <NavLink to="/pos" className={linkClass}>
            Kasir (POS)
          </NavLink>
          {isOwner && (
            <>
              <NavLink to="/menu" className={linkClass}>
                Kelola Menu
              </NavLink>
              <NavLink to="/kustom" className={linkClass}>
                Kustom Menu
              </NavLink>
              <NavLink to="/meja" className={linkClass}>
                Meja &amp; QR
              </NavLink>
              <NavLink to="/admins" className={linkClass}>
                Kelola Admin
              </NavLink>
            </>
          )}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden md:block text-right leading-tight">
            <p className="text-xs font-semibold max-w-[140px] truncate">{user?.displayName || user?.email}</p>
            <p className="text-[11px] text-ink-muted">{ROLE_LABEL[role] || ''}</p>
          </div>
          <button
            onClick={logout}
            className="text-sm font-semibold text-ink-muted hover:text-danger transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            Keluar
          </button>
        </div>
      </div>
    </header>
  )
}