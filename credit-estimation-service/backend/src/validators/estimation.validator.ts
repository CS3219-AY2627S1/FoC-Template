// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-10-25
// Scope: Defined validation for the author-defined estimation request interface, including input sanitization and error handling.
// Error handling messages were author-defined.
// Author review: Reviewed outputs, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements.

import { CreditEstimationErrors, EstimateCreditRequest, ServiceType } from '@relay/contracts'
import { EstimationServiceError } from '../types/estimation.types'

export const MAX_NAME_LENGTH = 200
export const MAX_DESCRIPTION_LENGTH = 5000
export const MAX_INSTRUCTIONS_LENGTH = 5000

/** Dangerous patterns to reject (XSS, injection, prompt injection) */
const dangerousPatterns = [
  /<script\b/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /<iframe\b/i,
  /eval\(/i,
  /document\./i,
  /window\./i,
  /fetch\(/i,
  /XMLHttpRequest/i,
  /alert\(/i,
  /prompt\(/i,
  /confirm\(/i,
  /console\.(log|error|warn)/i,
  /process\./i,
  /require\(/i,
  /__proto__/i,
  /prototype/i,
]

function containsDangerousPatterns(text: string): boolean {
  for (const pattern of dangerousPatterns) {
    if (pattern.test(text)) {
      return true
    }
  }
  return false
}

export function validateEstimateRequest(
  request: EstimateCreditRequest,
  now: Date = new Date(),
): void {
  if (typeof request.userId !== 'string' || request.userId.trim().length === 0) {
    throw new EstimationServiceError(
      CreditEstimationErrors.INVALID_INPUT,
      'User ID is required',
      400,
      { userId: 'User ID is required' },
    )
  }

  if (
    typeof request.availableCredit !== 'number' ||
    !Number.isFinite(request.availableCredit) ||
    request.availableCredit < 0
  ) {
    throw new EstimationServiceError(
      CreditEstimationErrors.INVALID_INPUT,
      'Available credit must be a nonnegative number',
      400,
      { availableCredit: 'Available credit must be a nonnegative number' },
    )
  }

  // Validate name
  if (typeof request.name !== 'string') {
    throw new EstimationServiceError(
      CreditEstimationErrors.INVALID_INPUT,
      'Name must be a string',
      400,
      { name: 'Name must be a string' },
    )
  }

  if (request.name.length === 0) {
    throw new EstimationServiceError(
      CreditEstimationErrors.INVALID_INPUT,
      'Name cannot be empty',
      400,
      { name: 'Name cannot be empty' },
    )
  }

  if (request.name.length > MAX_NAME_LENGTH) {
    throw new EstimationServiceError(
      CreditEstimationErrors.INVALID_INPUT,
      `Name must be at most ${MAX_NAME_LENGTH} characters`,
      400,
      { name: `Name must be at most ${MAX_NAME_LENGTH} characters` },
    )
  }

  if (containsDangerousPatterns(request.name)) {
    throw new EstimationServiceError(
      CreditEstimationErrors.INVALID_INPUT,
      'Name contains invalid characters',
      400,
      { name: 'Name contains invalid characters' },
    )
  }

  // Validate description
  if (typeof request.description !== 'string') {
    throw new EstimationServiceError(
      CreditEstimationErrors.INVALID_INPUT,
      'Description must be a string',
      400,
      { description: 'Description must be a string' },
    )
  }

  if (request.description.length === 0) {
    throw new EstimationServiceError(
      CreditEstimationErrors.INVALID_INPUT,
      'Description cannot be empty',
      400,
      { description: 'Description cannot be empty' },
    )
  }

  if (request.description.length > MAX_DESCRIPTION_LENGTH) {
    throw new EstimationServiceError(
      CreditEstimationErrors.INVALID_INPUT,
      `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters`,
      400,
      { description: `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters` },
    )
  }

  if (containsDangerousPatterns(request.description)) {
    throw new EstimationServiceError(
      CreditEstimationErrors.INVALID_INPUT,
      'Description contains invalid characters',
      400,
      { description: 'Description contains invalid characters' },
    )
  }

  if (request.instructions !== undefined) {
    if (
      typeof request.instructions !== 'string' ||
      request.instructions.length > MAX_INSTRUCTIONS_LENGTH
    ) {
      throw new EstimationServiceError(
        CreditEstimationErrors.INVALID_INPUT,
        `Instructions must be at most ${MAX_INSTRUCTIONS_LENGTH} characters`,
        400,
        { instructions: `Instructions must be at most ${MAX_INSTRUCTIONS_LENGTH} characters` },
      )
    }
    if (containsDangerousPatterns(request.instructions)) {
      throw new EstimationServiceError(
        CreditEstimationErrors.INVALID_INPUT,
        'Instructions contain invalid characters',
        400,
        { instructions: 'Instructions contain invalid characters' },
      )
    }
  }

  for (const field of ['startAt', 'expiresAt'] as const) {
    if (
      typeof request[field] !== 'string' ||
      request[field].trim().length === 0 ||
      Number.isNaN(Date.parse(request[field]))
    ) {
      throw new EstimationServiceError(
        CreditEstimationErrors.INVALID_INPUT,
        `${field} must be a valid date string`,
        400,
        { [field]: `${field} must be a valid date string` },
      )
    }
  }

  const startTimestamp = Date.parse(request.startAt)
  const expiryTimestamp = Date.parse(request.expiresAt)
  if (expiryTimestamp <= Math.max(startTimestamp, now.getTime())) {
    throw new EstimationServiceError(
      CreditEstimationErrors.INVALID_INPUT,
      'expiresAt must be after the effective start time',
      400,
      { expiresAt: 'Deadline must be after the start time and in the future' },
    )
  }

  // Validate service type
  if (typeof request.serviceType !== 'number') {
    throw new EstimationServiceError(
      CreditEstimationErrors.INVALID_INPUT,
      'Service type must be a number',
      400,
      { serviceType: 'Service type must be a number' },
    )
  }

  if (!Number.isInteger(request.serviceType)) {
    throw new EstimationServiceError(
      CreditEstimationErrors.INVALID_INPUT,
      'Service type must be an integer',
      400,
      { serviceType: 'Service type must be an integer' },
    )
  }

  if (!Object.values(ServiceType).includes(request.serviceType)) {
    throw new EstimationServiceError(
      CreditEstimationErrors.INVALID_INPUT,
      'Service type must exist',
      400,
      { serviceType: 'Service type must exist' },
    )
  }
}
