/* AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-08
 * Scope: Tests last request API calls per the team spec.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { expect, it, vi } from 'vitest'
vi.mock('../../src/api/http', () => ({ request: vi.fn() }))
import { request } from '../../src/api/http'
import { getLastRequest, saveLastRequest } from '../../src/api/lastRequest'

it('uses the last-request endpoints', () => {
  getLastRequest()
  expect(request).toHaveBeenCalledWith('/users/me/last-request')
  saveLastRequest('3', 'Lobby')
  expect(request).toHaveBeenCalledWith('/users/me/last-request', {
    method: 'PUT', json: { last_req_del_loc_id: 3, last_req_del_loc_details: 'Lobby' },
  })
})
