// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-10-24
// Scope: Implemented translation of known persistence errors into the existing domain errors.
// Author review: All errors were author-defined; AI assisted only with the translation implementation.
// The output was reviewed and corrected.

import { ERRAND_ERROR_MAP } from '../constants/errand-error-map'
import { ErrandServiceError } from '../types/errand.types'

/**
 * Translates repository error messages to API errors using the error map.
 * If the error message is not in the map, the original error is thrown.
 */
export function translateError(error: Error): ErrandServiceError {
  const message = error.message as keyof typeof ERRAND_ERROR_MAP
  const mappedError = ERRAND_ERROR_MAP[message]

  if (mappedError) {
    return new ErrandServiceError(mappedError.code, mappedError.userMessage, mappedError.statusCode)
  }

  throw error
}
