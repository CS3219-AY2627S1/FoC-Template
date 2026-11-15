/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Wrapped the Vite template's entry point with the router, toast and auth providers.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './components/toast/ToastProvider.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'

// AuthProvider uses both the router and toasts, so it is nested inside them.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)
