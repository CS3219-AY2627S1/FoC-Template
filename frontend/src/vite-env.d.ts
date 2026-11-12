/// <reference types="vite/client" />

/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-09
 * Scope: Added Chat Service frontend environment typing.
 */

interface ImportMetaEnv {
  readonly VITE_USER_API_URL: string
  readonly VITE_SUPPLIER_API_URL: string
  readonly VITE_ORDER_API_URL: string
  readonly VITE_CREDIT_API_URL: string
  readonly VITE_NOTIFICATION_API_URL?: string
  readonly VITE_CHAT_API_URL?: string
  readonly VITE_RAG_API_URL?: string
  readonly VITE_AI_ASSISTANT_API_URL?: string
  readonly VITE_MOCK_AUTH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
