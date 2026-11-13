import {
  createRootRouteWithContext,
  createRoute,
  Outlet,
  redirect,
} from '@tanstack/react-router'
import type { ReactElement } from 'react'

import { LoginPage } from '#/features/auth/pages/LoginPage/LoginPage'
import { RegisterPage } from '#/features/auth/pages/RegisterPage/RegisterPage'
import { ForgotPasswordPage } from '#/features/auth/pages/ForgotPasswordPage/ForgotPasswordPage'
import { ResetPasswordPage } from '#/features/auth/pages/ResetPasswordPage/ResetPasswordPage'
import { VerifyEmailPage } from '#/features/auth/pages/VerifyEmailPage/VerifyEmailPage'
import { AdminOverviewPage } from '#/pages/AdminOverviewPage/AdminOverviewPage'
import { SupplierListPage } from '#/features/suppliers/pages/SupplierListPage/SupplierListPage'
import { SupplierCreatePage } from '#/features/suppliers/pages/SupplierCreatePage/SupplierCreatePage'
import { SupplierEditPage } from '#/features/suppliers/pages/SupplierEditPage/SupplierEditPage'
import { SupplierCategoryPage } from '#/features/suppliers/pages/SupplierCategoryPage/SupplierCategoryPage'
import { FindSupplierPage } from '#/features/suppliers/pages/FindSupplierPage/FindSupplierPage'
import { CampusMapPage } from '#/features/suppliers/pages/CampusMapPage/CampusMapPage'
import type { SupplierCategory } from '#/features/suppliers/types/supplier.types'
import {
  parseSupplierListSearch,
  toSupplierFilters,
} from '#/features/suppliers/utils/supplierFilters'
import { AccountLayout } from '#/features/auth/layouts/AccountLayout/AccountLayout'
import { MapAccountLayout } from '#/features/auth/layouts/AccountLayout/MapAccountLayout'
import { EditProfilePage } from '#/features/auth/pages/EditProfilePage/EditProfilePage'
import { ProfilePage } from '#/features/auth/pages/ProfilePage/ProfilePage'
import { ErrorPage } from '#/pages/ErrorPage'
import { LoadingPage } from '#/pages/LoadingPage'
import { AdminLayout } from '#/layouts/AdminLayout/AdminLayout'
import { UserListPage } from '#/features/users/pages/UserListPage/UserListPage'
import { UserEditPage } from '#/features/users/pages/UserEditPage/UserEditPage'
import { UserViewPage } from '#/features/users/pages/UserViewPage/UserViewPage'
import { validateUserListSearch } from '#/features/users/pages/UserListPage/utils/userListSearch'
import { AuthLayout } from '#/features/auth/layouts/AuthLayout/AuthLayout'
import { RequesterHomePage } from '#/features/orders/pages/RequesterHomePage/RequesterHomePage'
import { CourierHomePage } from '#/features/orders/pages/CourierHomePage/CourierHomePage'
import type { AuthOperations } from '#/features/auth/providers/AuthProvider'
import { hasAdminRole } from '#/features/auth/utils/hasAdminRole'
import { CreateErrandPage } from '#/features/orders/pages/CreateErrandPage/CreateErrandPage'
import { MyErrandsPage } from '#/features/orders/pages/MyErrandsPage/MyErrandsPage'
import { OrderDetailPage } from '#/features/orders/pages/OrderDetailPage/OrderDetailPage'
import {
  parseOrderListSearch,
  parseAdminOrderSearch,
  parsePage,
} from '#/features/orders/utils/orderFilters'
import { AdminOrderListPage } from '#/features/orders/pages/AdminOrderListPage/AdminOrderListPage'
import { AdminOrderDetailPage } from '#/features/orders/pages/AdminOrderDetailPage/AdminOrderDetailPage'
import { AdminDisputeLogPage } from '#/features/orders/pages/AdminDisputeLogPage/AdminDisputeLogPage'

const rootRoute = createRootRouteWithContext<{ auth: AuthOperations }>()()

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/home', replace: true })
  },
})

const authLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'auth',
  component: AuthLayout,
})

const loginRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  component: LoginPage,
  path: '/login',
})

const registerRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  component: RegisterPage,
  path: '/register',
})

const verifyEmailRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/verify-email',
  component: VerifyEmailPage,
  validateSearch: (
    search: Record<string, unknown>,
  ): { token?: string; email?: string; purpose?: 'email-change' } => ({
    purpose: search.purpose === 'email-change' ? 'email-change' : undefined,
    token:
      typeof search.token === 'string' && search.token
        ? search.token
        : undefined,
    email:
      typeof search.email === 'string' && search.email
        ? search.email
        : undefined,
  }),
})

const forgotPasswordRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/forgot-password',
  component: ForgotPasswordPage,
})

const resetPasswordRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/reset-password',
  component: ResetPasswordPage,
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token:
      typeof search.token === 'string' && search.token
        ? search.token
        : undefined,
  }),
})

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  component: Outlet,
  beforeLoad: async ({ context }) => {
    if (!(await context.auth.ensureAuthenticated())) {
      throw redirect({ to: '/login', replace: true })
    }
  },
  pendingMs: 500,
  pendingMinMs: 0,
  pendingComponent: LoadingPage,
  errorComponent: ErrorPage,
})

const userRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  id: 'user',
  component: AccountLayout,
})

const mapAccountRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  id: 'map-account',
  component: MapAccountLayout,
})

const profileRoute = createRoute({
  getParentRoute: () => userRoute,
  path: '/profile',
  component: ProfilePage,
})

const editProfileRoute = createRoute({
  getParentRoute: () => userRoute,
  path: '/profile/edit',
  component: EditProfilePage,
})

const homeRoute = createRoute({
  getParentRoute: () => userRoute,
  path: '/home',
  validateSearch: (
    search: Record<string, unknown>,
  ): { mode?: 'courier'; q?: string; page?: number } => ({
    q: typeof search.q === 'string' ? search.q : undefined,
    page: search.page == null ? undefined : parsePage(search.page),
    mode: search.mode === 'courier' ? 'courier' : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (search.mode === 'courier') {
      throw redirect({
        to: '/deliver',
        search: { q: search.q, page: search.page },
        replace: true,
      })
    }
  },
  component: RequesterHomePage,
})

const requestRoute = createRoute({
  getParentRoute: () => userRoute,
  path: '/request',
  validateSearch: (
    search: Record<string, unknown>,
  ): { category?: SupplierCategory } => {
    const categories = toSupplierFilters(
      parseSupplierListSearch(search),
    ).category
    return {
      category: categories?.length === 1 ? categories[0] : undefined,
    }
  },
  component: FindSupplierPage,
})

const deliverRoute = createRoute({
  getParentRoute: () => userRoute,
  path: '/deliver',
  validateSearch: (
    search: Record<string, unknown>,
  ): { q?: string; page?: number } => ({
    q: typeof search.q === 'string' ? search.q : undefined,
    page: search.page == null ? undefined : parsePage(search.page),
  }),
  component: CourierHomePage,
})

const campusMapRoute = createRoute({
  getParentRoute: () => mapAccountRoute,
  path: '/map',
  component: CampusMapPage,
})

const supplierCategoryRoute = createRoute({
  getParentRoute: () => userRoute,
  path: '/locations',
  component: (): ReactElement => {
    const { category } = supplierCategoryRoute.useRouteContext()
    return <SupplierCategoryPage category={category} />
  },
  validateSearch: parseSupplierListSearch,
  beforeLoad: ({ search }) => {
    const categories = toSupplierFilters(search).category
    const category = categories?.[0]
    if (categories?.length !== 1 || !category) {
      throw redirect({
        to: '/home',
        replace: true,
      })
    }
    return { category }
  },
})

const createErrandRoute = createRoute({
  getParentRoute: () => userRoute,
  path: '/errands/new',
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    supplier?: string
    from?: string
    category?: SupplierCategory
  } => {
    const category = toSupplierFilters(parseSupplierListSearch(search))
      .category?.[0]
    return {
      supplier:
        typeof search.supplier === 'string' && search.supplier
          ? search.supplier
          : undefined,
      from:
        typeof search.from === 'string' && search.from
          ? search.from
          : undefined,
      category,
    }
  },
  component: CreateErrandPage,
})
const myErrandsRoute = createRoute({
  getParentRoute: () => userRoute,
  path: '/errands',
  component: MyErrandsPage,
  validateSearch: parseOrderListSearch,
})
const orderDetailRoute = createRoute({
  getParentRoute: () => userRoute,
  path: '/errands/$orderId',
  component: OrderDetailPage,
  validateSearch: (search: Record<string, unknown>) => ({
    ...parseOrderListSearch(search),
    posted: search.posted === true || search.posted === 'true',
  }),
})

// Below are admin routes
const adminLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  component: AdminLayout,
  beforeLoad: async ({ context }) => {
    if (!(await context.auth.ensureAuthenticated())) {
      throw redirect({ to: '/login', replace: true })
    }
    if (!hasAdminRole()) {
      throw redirect({ to: '/home', replace: true })
    }
  },
  pendingMs: 500,
  pendingMinMs: 0,
  pendingComponent: LoadingPage,
  errorComponent: ErrorPage,
})

const adminIndexRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/',
  component: AdminOverviewPage,
})

const adminOrderListRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/orders',
  component: AdminOrderListPage,
  validateSearch: parseAdminOrderSearch,
})
const adminOrderDetailRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/orders/$orderId',
  component: AdminOrderDetailPage,
  validateSearch: parseAdminOrderSearch,
})

const adminAuditLogRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/audit-log',
  component: AdminDisputeLogPage,
  validateSearch: (search: Record<string, unknown>) => ({
    page: parsePage(search.page),
  }),
})

const supplierListRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/suppliers',
  component: SupplierListPage,
  validateSearch: parseSupplierListSearch,
})

const supplierCreateRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/suppliers/new',
  component: SupplierCreatePage,
})

const supplierEditRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/suppliers/$supplierId/edit',
  component: SupplierEditPage,
})

const userListRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/users',
  component: UserListPage,
  validateSearch: validateUserListSearch,
})

const userEditRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/users/$userId/edit',
  component: UserEditPage,
  validateSearch: validateUserListSearch,
})

const userViewRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: '/users/$userId',
  component: UserViewPage,
  validateSearch: validateUserListSearch,
})

export const routeTree = rootRoute.addChildren([
  indexRoute,
  authenticatedRoute.addChildren([
    userRoute.addChildren([
      homeRoute,
      requestRoute,
      deliverRoute,
      supplierCategoryRoute,
      createErrandRoute,
      myErrandsRoute,
      orderDetailRoute,
      profileRoute,
      editProfileRoute,
    ]),
    mapAccountRoute.addChildren([campusMapRoute]),
    // Admin pages have their own sidebar layout.
    adminLayoutRoute.addChildren([
      adminIndexRoute,
      adminOrderListRoute,
      adminOrderDetailRoute,
      adminAuditLogRoute,
      supplierListRoute,
      supplierCreateRoute,
      supplierEditRoute,
      userListRoute,
      userViewRoute,
      userEditRoute,
    ]),
  ]),
  authLayoutRoute.addChildren([
    loginRoute,
    registerRoute,
    verifyEmailRoute,
    forgotPasswordRoute,
    resetPasswordRoute,
  ]),
])
