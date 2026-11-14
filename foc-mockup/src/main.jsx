/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component main.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Wrapped the app in AdminSuppliersProvider for the admin supplier mockup. No requirements, architecture, schema, or API decisions were
 *        made by the AI tool.
 * Author review: Congchen
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { DemoProvider } from './context/DemoContext'
import { AdminSuppliersProvider } from './context/AdminSuppliersContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <DemoProvider>
        <AdminSuppliersProvider>
          <App />
        </AdminSuppliersProvider>
      </DemoProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
