import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import type { MapViewport, SupplierRemoteProps } from '@relay/contracts'
import { mockSupplierApi } from './mockSupplierApi/mockSupplierApi'
import { createHttpSupplierApi } from './supplierApi'

const supplierApi =
  import.meta.env.VITE_SUPPLIER_API_MODE === 'mock' ? mockSupplierApi : createHttpSupplierApi()
const errandApi: SupplierRemoteProps['errandApi'] = {
  getErrands: async () => ({ errands: [] }),
  getSupplierErrandView: async () => ({ errands: [] }),
  acceptErrand: async () => {
    throw new Error('No mock errands are available to accept.')
  },
}

function StandaloneApp() {
  const [supplierMode, setMode] = useState<SupplierRemoteProps['supplierMode']>('explore')
  const [mapViewport, setViewport] = useState<MapViewport>({
    center: { lat: 1.2966, lng: 103.7764 },
    zoom: 16,
  })
  return (
    <App
      supplierApi={supplierApi}
      errandApi={errandApi}
      userProfile={null}
      creditBalance={null}
      authVersion={0}
      supplierMode={supplierMode}
      navigateTo={(service) => {
        window.location.hash = service
      }}
      openProfile={() => {
        window.location.hash = 'profile'
      }}
      openCredit={() => {
        window.location.hash = 'credit'
      }}
      openErrandView={(context) => {
        window.location.hash = context.view
        if (
          context.view === 'explore' ||
          context.view === 'requests' ||
          context.view === 'my-errands'
        )
          setMode(context.view)
      }}
      onErrandAccepted={() => setMode('my-errands')}
      mapViewport={mapViewport}
      onMapViewportChange={setViewport}
      mapActive={true}
    />
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StandaloneApp />
  </StrictMode>,
)
