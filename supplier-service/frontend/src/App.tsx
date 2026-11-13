import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireAdmin } from './auth/RequireAdmin'
import { RequireUserMode } from './auth/RequireUserMode'
import { AppShell } from './components/AppShell'
import {
  CreateSupplierPage,
  EditSupplierPage,
} from './pages/AdminSupplierFormPage'
import { AdminSupplierListPage } from './pages/AdminSupplierListPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SupplierDetailPage } from './pages/SupplierDetailPage'
import { SupplierDirectoryPage } from './pages/SupplierDirectoryPage'

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate replace to="/suppliers" />} />
          <Route element={<RequireUserMode />}>
            <Route path="suppliers" element={<SupplierDirectoryPage />} />
            <Route path="suppliers/:id" element={<SupplierDetailPage />} />
          </Route>
          <Route element={<RequireAdmin />}>
            <Route path="admin/suppliers" element={<AdminSupplierListPage />} />
            <Route
              path="admin/suppliers/new"
              element={<CreateSupplierPage />}
            />
            <Route
              path="admin/suppliers/:id/edit"
              element={<EditSupplierPage />}
            />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
