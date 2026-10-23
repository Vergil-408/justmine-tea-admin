import { Navigate } from 'react-router-dom'
import { useAdminAuth } from '../context/AdminAuthContext.jsx'

// ownerOnly: halaman khusus owner (kasir diarahkan kembali ke Pesanan).
export default function ProtectedAdminRoute({ children, ownerOnly = false }) {
  const { status, isAuthed, isOwner } = useAdminAuth()

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-ink-muted">Memeriksa akses…</div>
    )
  }
  if (!isAuthed) return <Navigate to="/login" replace />
  if (ownerOnly && !isOwner) return <Navigate to="/orders" replace />
  return children
}
