import { describe, expect, it } from 'vitest'
import { MAX_IMAGE_BYTES, validateImageFile } from './supplierImage'

const file = (type: string, size: number) =>
  new File([new Uint8Array(size)], 'photo', { type })

describe('validateImageFile', () => {
  it('accepts JPEG and PNG up to 5 MB', () => {
    expect(validateImageFile(file('image/jpeg', 100))).toBeNull()
    expect(validateImageFile(file('image/png', MAX_IMAGE_BYTES))).toBeNull()
  })

  it('rejects other types and larger files', () => {
    expect(validateImageFile(file('image/gif', 100))).toMatch(/JPEG or PNG/)
    expect(validateImageFile(file('image/png', MAX_IMAGE_BYTES + 1))).toMatch(
      /5 MB/,
    )
  })
})
