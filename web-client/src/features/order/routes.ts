import type { FeatureRoutes } from '@/lib/routing'
import { AdminOrdersPage } from './pages/AdminOrdersPage'
import { ErrandsPage } from './pages/ErrandsPage'
import { PostErrandPage } from './pages/PostErrandPage'
import { ErrandDetailPage } from './pages/ErrandDetailPage'

export const orderRoutes: FeatureRoutes = {
  app: [
    { path: 'errands', Component: ErrandsPage },
    { path: 'errands/new', Component: PostErrandPage },
    { path: 'errands/:id', Component: ErrandDetailPage},
  ],
  admin: [
    { path: 'orders', Component: AdminOrdersPage },
  ],
}
