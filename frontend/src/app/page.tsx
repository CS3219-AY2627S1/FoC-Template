/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex, date: 2026-11-01
 * Mode: User-requested navigation update.
 * Scope: Replace the retired user Dashboard with a Browse Errands redirect.
 * Author review: Pending.
 */
import { redirect } from "next/navigation"

export default function HomePage() {
  redirect("/errands")
}
