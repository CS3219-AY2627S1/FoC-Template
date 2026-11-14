/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component main.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: <pending — team member to sign>
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Wrapped the app in AdminSuppliersProvider for the admin supplier mockup. No requirements, architecture, schema, or API decisions were
 *        made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Removed the admin mock store provider now that the admin screens use the Supplier Service. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: Mounted AuthProvider and ToastProvider, per instructions.md Stage 16b. AuthProvider
 *        wraps DemoProvider so DemoContext's (now demo-only) state stays independent of auth;
 *        both need the router, so they sit inside BrowserRouter.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-05
 * Scope: Mounted BookmarksProvider inside ToastProvider, per the 2026-11-05 supplier-bookmarking
 *        spec. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-11
 * Scope: removed DemoProvider (the demo is gone, all services are live).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './components/Toast'
import { BookmarksProvider } from './context/BookmarksContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <BookmarksProvider>
            <App />
          </BookmarksProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
