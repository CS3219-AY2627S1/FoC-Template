/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-07
 * Scope: Implemented Supplier navigation and integration with the existing shared shell.
 * Author review: I validated correctness, and added boundary checks.
 */

// AI Assistance Disclosure:
// Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
// Scope: Added icons used by the Order navigation entries.
// Author review: I validated correctness and added boundary checks where needed.

export function MessagesIcon() {
  return <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20"><path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2v-10a9 9 0 0 1 18 0ZM7 10h10M7 14h6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>;
}

export function DashboardIcon() {
  return <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>;
}

export function DisputeIcon() {
  return <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20"><path d="M12 3 2 20h20L12 3ZM12 10v4M12 17h.01" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>;
}

export function OrderIcon() {
  return <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20"><path d="M8 4H5v17h14V4h-3M8 3h8v4H8zM8 12h8M8 16h5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>;
}

export function SupplierNavigationIcon() {
  return <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20">
    <path d="m3 10 9-7 9 7H3ZM5 10v11h14V10M9 21v-7h6v7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
  </svg>;
}

export function SupplierIcon({ size = 20 }: { size?: number }) {
  return <svg aria-hidden="true" fill="none" height={size} viewBox="0 0 24 24" width={size}>
    <path d="M4 9h16v11H4zM7 9V6a5 5 0 0 1 10 0v3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
  </svg>;
}

export function ProfileIcon() {
  return <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20">
    <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
    <path d="M4 21c.8-4.2 3.5-6.3 8-6.3s7.2 2.1 8 6.3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
  </svg>;
}

export function UsersIcon() {
  return <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20">
    <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
    <path d="M3.5 20c.55-3.55 2.36-5.35 5.5-5.35 3.16 0 4.98 1.8 5.5 5.35" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    <path d="M16.2 5.5a2.75 2.75 0 0 1 0 5.35M17.15 14.9c2.08.2 3.28 1.76 3.65 4.1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
  </svg>;
}

export function WalletIcon() {
  return <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 29.2 28.2" width="20">
    <path d="M22.1 6.1H7.1a6 6 0 0 0-6 6v9a6 6 0 0 0 6 6h15a6 6 0 0 0 6-6v-9a6 6 0 0 0-6-6Z" stroke="currentColor" strokeWidth="2.2" />
    <path d="M3.1 7.1v-3c0-1.7 1.3-3 3-3h17" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
    <circle cx="22.1" cy="17.1" fill="currentColor" r="2" />
  </svg>;
}
