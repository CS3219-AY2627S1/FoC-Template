/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
 * Scope: Implemented Supplier navigation and integration with the existing shared shell.
 * Author review: I validated correctness, and added boundary checks.
 */

import { APP_NAME, APP_TAGLINE } from "../app/branding";

type BrandVariant = "auth" | "sidebar" | "mobile";

export function AppBrandMark({ variant = "auth" }: { variant?: BrandVariant }) {
  const sizeClass = variant === "sidebar" ? " foc-mark-sidebar" : variant === "mobile" ? " foc-mark-small" : "";
  return <span aria-hidden="true" className={`foc-mark${sizeClass}`}><span /><span /></span>;
}

export function AppBrand({ variant = "sidebar" }: { variant?: "sidebar" | "mobile" }) {
  return <div className={`app-brand app-brand-${variant}`}>
    <AppBrandMark variant={variant} />
    <div className="app-brand-copy">
      <strong className="app-brand-name">{APP_NAME}</strong>
      {variant === "sidebar" ? <small className="app-brand-tagline">{APP_TAGLINE}</small> : null}
    </div>
  </div>;
}
