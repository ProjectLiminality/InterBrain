import { describe, it, expect } from 'vitest'
import {
  calculateSpawnPosition,
  calculateExitPosition,
  calculateRandomSpawnPosition,
  EPHEMERAL_SPAWN_RADIUS,
  DEFAULT_EPHEMERAL_SPAWN_CONFIG,
} from './EphemeralSpawning'

describe('calculateSpawnPosition', () => {
  it('should spawn center node from above', () => {
    const result = calculateSpawnPosition([0, 0, 0], 3, true)
    expect(result).toEqual([0, EPHEMERAL_SPAWN_RADIUS, 0])
  })

  it('should place spawn at fixed radius in same angular direction as target', () => {
    // Target at positive X → spawn should be at positive X, radius distance
    const result = calculateSpawnPosition([100, 0, 50], 3, false)

    // Angle should be atan2(0, 100) = 0, so spawn at (RADIUS, 0, 0)
    expect(result[0]).toBeCloseTo(EPHEMERAL_SPAWN_RADIUS, 1)
    expect(result[1]).toBeCloseTo(0, 1)
    expect(result[2]).toBe(0) // z always 0 (camera plane)
  })

  it('should maintain direction from origin to target in XY plane', () => {
    // Target at 45 degrees (equal x and y)
    const target: [number, number, number] = [100, 100, 50]
    const result = calculateSpawnPosition(target, 3, false)

    // Direction should be at 45 degrees (pi/4)
    const theta = Math.atan2(100, 100)
    expect(result[0]).toBeCloseTo(EPHEMERAL_SPAWN_RADIUS * Math.cos(theta), 1)
    expect(result[1]).toBeCloseTo(EPHEMERAL_SPAWN_RADIUS * Math.sin(theta), 1)
  })

  it('should always set z to 0', () => {
    const targets: Array<[number, number, number]> = [
      [50, 50, 100],
      [-100, 200, -50],
      [0, 300, 999],
    ]
    for (const target of targets) {
      const result = calculateSpawnPosition(target, 3, false)
      expect(result[2]).toBe(0)
    }
  })

  it('should produce spawn at fixed radius distance from origin', () => {
    const result = calculateSpawnPosition([200, 300, 0], 3, false)
    const distance = Math.sqrt(result[0] ** 2 + result[1] ** 2 + result[2] ** 2)
    expect(distance).toBeCloseTo(EPHEMERAL_SPAWN_RADIUS, 1)
  })
})

describe('calculateExitPosition', () => {
  it('should exit center node upward', () => {
    const result = calculateExitPosition([0, 0, 0], 3, true)
    expect(result).toEqual([0, EPHEMERAL_SPAWN_RADIUS, 0])
  })

  it('should place exit at fixed radius in same angular direction as current position', () => {
    const result = calculateExitPosition([50, 0, 20], 3, false)

    // Angle is atan2(0, 50) = 0
    expect(result[0]).toBeCloseTo(EPHEMERAL_SPAWN_RADIUS, 1)
    expect(result[1]).toBeCloseTo(0, 1)
    expect(result[2]).toBe(0)
  })

  it('should mirror spawn behavior for visual consistency', () => {
    // Same position should produce same spawn and exit locations
    const pos: [number, number, number] = [150, -200, 0]
    const spawn = calculateSpawnPosition(pos, 3, false)
    const exit = calculateExitPosition(pos, 3, false)

    expect(spawn[0]).toBeCloseTo(exit[0], 5)
    expect(spawn[1]).toBeCloseTo(exit[1], 5)
    expect(spawn[2]).toBeCloseTo(exit[2], 5)
  })
})

describe('calculateRandomSpawnPosition', () => {
  it('should produce positions at approximately sphere radius distance in XY', () => {
    const result = calculateRandomSpawnPosition(5000)
    const xyDistance = Math.sqrt(result[0] ** 2 + result[1] ** 2)
    expect(xyDistance).toBeCloseTo(5000, -1) // within ~10 units
  })

  it('should set z to 30% depth into sphere', () => {
    const radius = 5000
    const result = calculateRandomSpawnPosition(radius)
    expect(result[2]).toBeCloseTo(-radius * 0.3, 1)
  })

  it('should produce different positions on successive calls', () => {
    const results = new Set<string>()
    for (let i = 0; i < 10; i++) {
      const r = calculateRandomSpawnPosition()
      results.add(`${r[0].toFixed(0)},${r[1].toFixed(0)}`)
    }
    // With random angles, we should get multiple distinct positions
    expect(results.size).toBeGreaterThan(1)
  })
})

describe('EPHEMERAL_SPAWN_RADIUS', () => {
  it('should be 500 world units', () => {
    expect(EPHEMERAL_SPAWN_RADIUS).toBe(500)
  })
})

describe('DEFAULT_EPHEMERAL_SPAWN_CONFIG', () => {
  it('should have 1 second animation durations (canonical heartbeat)', () => {
    expect(DEFAULT_EPHEMERAL_SPAWN_CONFIG.spawnAnimationDuration).toBe(1000)
    expect(DEFAULT_EPHEMERAL_SPAWN_CONFIG.exitAnimationDuration).toBe(1000)
  })

  it('should use easeInOutQuart for spawn and easeInQuart for exit', () => {
    expect(DEFAULT_EPHEMERAL_SPAWN_CONFIG.spawnEasing).toBe('easeInOutQuart')
    expect(DEFAULT_EPHEMERAL_SPAWN_CONFIG.exitEasing).toBe('easeInQuart')
  })
})
