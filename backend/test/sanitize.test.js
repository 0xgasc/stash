import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { isSafeTusId, sanitizeFilename } = require('../utils/sanitize.js')

describe('isSafeTusId', () => {
  it('accepts typical TUS/uuid ids', () => {
    expect(isSafeTusId('a1b2c3d4e5')).toBe(true)
    expect(isSafeTusId('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(isSafeTusId('abc_DEF-123')).toBe(true)
  })

  it('rejects path traversal and junk', () => {
    expect(isSafeTusId('../../etc/passwd')).toBe(false)
    expect(isSafeTusId('..%2F..%2Fetc')).toBe(false)
    expect(isSafeTusId('a/b')).toBe(false)
    expect(isSafeTusId('a\\b')).toBe(false)
    expect(isSafeTusId('')).toBe(false)
    expect(isSafeTusId(null)).toBe(false)
    expect(isSafeTusId(undefined)).toBe(false)
    expect(isSafeTusId({})).toBe(false)
    expect(isSafeTusId('x'.repeat(200))).toBe(false)
  })
})

describe('sanitizeFilename', () => {
  it('strips directory components', () => {
    expect(sanitizeFilename('../../evil.sh')).toBe('evil.sh')
    expect(sanitizeFilename('/etc/passwd')).toBe('passwd')
  })

  it('handles empty/missing names', () => {
    expect(sanitizeFilename('')).toBe('file')
    expect(sanitizeFilename(null)).toBe('file')
  })

  it('keeps normal names intact', () => {
    expect(sanitizeFilename('photo (1).PNG')).toBe('photo (1).PNG')
  })
})
