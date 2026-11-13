import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'
import { init, loadRemote } from '@module-federation/runtime'
import type { ComponentType } from 'react'
import type { RemotePropsByService, RemoteServiceId } from '@relay/contracts'
import { REMOTE_REGISTRY } from './RemoteRegistry'

export type RemoteComponents = {
  [K in RemoteServiceId]: ComponentType<RemotePropsByService[K]>
}

type RemoteModule<K extends RemoteServiceId> = { default: RemoteComponents[K] }

// configure Module Federation to find components in the registry
init({
  name: 'relayHost',
  remotes: Object.values(REMOTE_REGISTRY).map(({ name, entry }) => ({
    name,
    type: 'module' as const,
    entry,
  })),
  shared: {
    react: {
      version: '19.2.8',
      lib: () => React,
      shareConfig: { singleton: true, requiredVersion: '^19.2.8' },
    },
    'react-dom': {
      version: '19.2.8',
      lib: () => ReactDOM,
      shareConfig: { singleton: true, requiredVersion: '^19.2.8' },
    },
    'react-dom/client': {
      version: '19.2.8',
      lib: () => ReactDOMClient,
      shareConfig: { singleton: true, requiredVersion: '^19.2.8' },
    },
  },
})

export async function loadServiceRemote<K extends RemoteServiceId>(
  service: K,
): Promise<RemoteModule<K>> {
  const remoteDef = REMOTE_REGISTRY[service]
  if (!remoteDef) throw new Error(`${service} frontend is not available.`)
  const { name, exposedModule } = remoteDef
  // This generic is the only trust assertion about independently deployed code.
  const remote = await loadRemote<RemoteModule<K>>(`${name}/${exposedModule.replace('./', '')}`)
  if (!remote) throw new Error(`${service} frontend returned no application.`)
  return remote
}
