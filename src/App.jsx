import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Orders from './pages/Orders.jsx'
import MenuAdmin from './pages/MenuAdmin.jsx'
import OptionsAdmin from './pages/OptionsAdmin.jsx'
import AdminsAdmin from './pages/AdminsAdmin.jsx'
import TablesAdmin from './pages/TablesAdmin.jsx'
import ProtectedAdminRoute from './components/ProtectedAdminRoute.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/orders"
        element={
          <ProtectedAdminRoute>
            <Orders />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/menu"
        element={
          <ProtectedAdminRoute ownerOnly>
            <MenuAdmin />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/kustom"
        element={
          <ProtectedAdminRoute ownerOnly>
            <OptionsAdmin />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/meja"
        element={
          <ProtectedAdminRoute ownerOnly>
            <TablesAdmin />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admins"
        element={
          <ProtectedAdminRoute ownerOnly>
            <AdminsAdmin />
          </ProtectedAdminRoute>
        }
      />
      <Route path="/" element={<Navigate to="/orders" replace />} />
      <Route path="*" element={<Navigate to="/orders" replace />} />
    </Routes>
  )
}