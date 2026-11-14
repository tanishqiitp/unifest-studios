import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('matchMedia', () => ({ matches: false }))
vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 800 })
vi.stubGlobal('localStorage', { getItem: () => null })
const { detectDevice } = await import('./device')

describe('detectDevice', () => {
  it('phones in portrait and landscape', () => {
    expect(detectDevice(390, 844, true)).toBe('phone')
    expect(detectDevice(844, 390, true)).toBe('phone')
  })
  it('iPads in both orientations use the tablet layout', () => {
    expect(detectDevice(820, 1180, true)).toBe('tablet')
    expect(detectDevice(1180, 820, true)).toBe('tablet')
    expect(detectDevice(1366, 1024, true)).toBe('tablet')
  })
  it('laptops and desktops', () => {
    expect(detectDevice(1280, 800, false)).toBe('desktop')
    expect(detectDevice(1920, 1080, false)).toBe('desktop')
    expect(detectDevice(900, 800, false)).toBe('tablet')
  })
})
