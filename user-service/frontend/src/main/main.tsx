import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../app/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App
      fetchSession={async () => {
        throw new Error('Sign in to start a standalone session.')
      }}
      authVersion={0}
      navigateTo={() => {
        window.location.hash = 'login'
      }}
      closeProfile={() => {
        window.location.hash = ''
      }}
      refreshUserProfile={async () => {}}
      presentation="full"
    />
  </StrictMode>,
)
