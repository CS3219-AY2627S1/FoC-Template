import { creditRoutes } from '@/features/credit/routes'
import { messageRoutes } from '@/features/message/routes'
import { orderRoutes } from '@/features/order/routes'
import { supplierRoutes } from '@/features/supplier/routes'
import { userRoutes } from '@/features/user/routes'
import type { FeatureRoutes } from '@/lib/routing'

// The routes of every feature. A new feature is registered here once, by the platform owner.
export const features: FeatureRoutes[] = [userRoutes, orderRoutes, supplierRoutes, creditRoutes, messageRoutes]
