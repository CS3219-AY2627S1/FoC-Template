import type { RouteObject } from 'react-router'

// How a feature plugs its pages into the app. Each group has its own layout and access rule:
//   guest: signed-out pages such as login and sign-up
//   app:   the student app, for any logged-in account
//   admin: the admin console, for administrators, all under /admin/
// Paths are relative and have no leading slash, e.g. 'profile' or 'suppliers/:id'.
export type FeatureRoutes = {
  guest?: RouteObject[]
  app?: RouteObject[]
  admin?: RouteObject[]
}