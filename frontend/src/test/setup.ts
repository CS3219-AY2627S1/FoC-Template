/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Installed Testing Library's DOM matchers for frontend tests in issue #28.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27. Scope: added
 * explicit component cleanup between Vitest cases for issue #29.
 * Author review: Reviewed and approved by @ron.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)
