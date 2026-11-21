import { describe, expect, it } from 'vitest'
import { isStaleCode } from '../../components/Safe3D'

describe('update detection', () => {
  it('recognises a missing code file from an older version in each browser', () => {
    expect(isStaleCode(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Model-abc.js'))).toBe(true) // Chrome, Edge
    expect(isStaleCode(new TypeError('error loading dynamically imported module'))).toBe(true) // Firefox
    expect(isStaleCode(new TypeError('Importing a module script failed.'))).toBe(true) // Safari
    expect(isStaleCode(new Error('Cannot read properties of undefined'))).toBe(false)
  })
})
