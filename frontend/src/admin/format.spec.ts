/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: Tests for the admin display helpers.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { describe, expect, it } from 'vitest'
import { browserSummary, sgDate, sgTime, shortHash } from './format'

describe('browserSummary', () => {
  it.each([
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 'Chrome on Linux'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0', 'Edge on Windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', 'Safari on macOS'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'Safari on iOS'],
    ['Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0', 'Firefox on Android'],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.0.0 Safari/537.36', 'Headless Chrome on Linux'],
    ['PostmanRuntime/7.43.0', 'Postman'],
    ['curl/8.5.0', 'curl'],
    ['node', 'Node.js'],
    ['SomethingElse/1.0', 'Other client'],
  ])('%s -> %s', (ua, expected) => {
    expect(browserSummary(ua)).toBe(expected)
  })

  it('handles a missing user agent', () => {
    expect(browserSummary(null)).toBe('Unknown browser')
  })
})

describe('time and hashes', () => {
  it('shows Singapore time (UTC+8), with seconds', () => {
    expect(sgTime('2026-11-01T16:00:05Z')).toMatch(/2 Nov 2026.*12:00:05/)
    expect(sgDate('2026-11-01T16:00:05Z')).toMatch(/2 Nov 2026/)
  })

  it('shortens hashes', () => {
    expect(shortHash('a'.repeat(64))).toBe(`${'a'.repeat(10)}…`)
    expect(shortHash('abc')).toBe('abc')
  })
})
