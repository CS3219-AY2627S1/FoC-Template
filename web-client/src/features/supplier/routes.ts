import type { FeatureRoutes } from '@/lib/routing'
import { AdminNewSupplierPage } from './pages/AdminNewSupplierPage'
import { AdminSupplierDetailPage } from './pages/AdminSupplierDetailPage'
import { AdminSuppliersPage } from './pages/AdminSuppliersPage'
import { SupplierDetailPage } from './pages/SupplierDetailPage'
import { SuppliersPage } from './pages/SuppliersPage'

export const supplierRoutes: FeatureRoutes = {
  app: [
    { path: 'suppliers', Component: SuppliersPage },
    { path: 'suppliers/:id', Component: SupplierDetailPage },
  ],
  admin: [
    { path: 'suppliers', Component: AdminSuppliersPage },
    { path: 'suppliers/new', Component: AdminNewSupplierPage },
    { path: 'suppliers/:id', Component: AdminSupplierDetailPage },
  ],
}
