declare module 'supplierFrontend/App' {
  import type { ComponentType } from 'react'
  import type { SupplierRemoteProps } from '@relay/contracts'
  const App: ComponentType<SupplierRemoteProps>
  export default App
}

declare module 'userFrontend/App' {
  import type { ComponentType } from 'react'
  import type { UserRemoteProps } from '@relay/contracts'
  const App: ComponentType<UserRemoteProps>
  export default App
}

declare module 'errandFrontend/App' {
  import type { ComponentType } from 'react'
  import type { ErrandRemoteProps } from '@relay/contracts'
  const App: ComponentType<ErrandRemoteProps>
  export default App
}

declare module 'creditFrontend/App' {
  import type { ComponentType } from 'react'
  import type { CreditRemoteProps } from '@relay/contracts'
  const App: ComponentType<CreditRemoteProps>
  export default App
}
