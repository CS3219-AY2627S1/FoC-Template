import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@relay/ui/styles.css'
import './index.css'
import App from '../app/App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
