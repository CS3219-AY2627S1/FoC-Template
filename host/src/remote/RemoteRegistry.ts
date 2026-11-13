import type { RemoteServiceId } from '@relay/contracts'

export type RemoteDefinition = {
  name: string
  entry: string
  exposedModule: string
}

// IMPORTANT: ensure config of each service's
// vite.config.ts has the same name, remoteEntry path
// and exposes the same module.
// Not all services have a frontend (e.g., credit-estimation is backend-only).
export const REMOTE_REGISTRY: Record<RemoteServiceId, RemoteDefinition> = {
  supplier: {
    name: 'supplierFrontend',
    entry: '/remotes/supplier/remoteEntry.js',
    exposedModule: './App',
  },
  user: {
    name: 'userFrontend',
    entry: '/remotes/user/remoteEntry.js',
    exposedModule: './App',
  },
  errand: {
    name: 'errandFrontend',
    entry: '/remotes/errand/remoteEntry.js',
    exposedModule: './App',
  },
  credit: {
    name: 'creditFrontend',
    entry: '/remotes/credit/remoteEntry.js',
    exposedModule: './App',
  },
}
