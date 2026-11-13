import type { FeatureRoutes } from '@/lib/routing'
import { AdminCreditsPage } from './pages/AdminCreditsPage'
import { WalletPage } from './pages/WalletPage'

export const creditRoutes: FeatureRoutes = {
  app: [{ path: 'wallet', Component: WalletPage }],
  admin: [{ path: 'credits', Component: AdminCreditsPage }],
}
