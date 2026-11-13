// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-10
// Scope: Generated initial implementation of the Errand frontend entry point.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import type { ErrandViewContext, MapViewport } from '@relay/contracts'
import { createHttpErrandApi } from './errandApi'
import { createHttpSupplierApi } from './supplierApi'

const errandApi = createHttpErrandApi()
const supplierApi = createHttpSupplierApi()

function StandaloneApp() {
  const [errandViewContext, setView] = useState<ErrandViewContext>({ view: 'requests' })
  const [mapViewport, setViewport] = useState<MapViewport>({
    center: { lat: 1.2966, lng: 103.7764 },
    zoom: 16,
  })
  return (
    <App
      errandApi={errandApi}
      supplierApi={supplierApi}
      userProfile={null}
      creditBalance={null}
      invalidateCreditBalance={() => {}}
      navigateTo={(service) => {
        window.location.hash = service
      }}
      openProfile={() => {
        window.location.hash = 'profile'
      }}
      openCredit={() => {
        window.location.hash = 'credit'
      }}
      openErrandView={setView}
      errandViewContext={errandViewContext}
      requestUserLocation={async () => undefined}
      presentation="full"
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
