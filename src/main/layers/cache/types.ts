import type { CachedSnapshot, SystemStatus } from '@shared/types'

/**
 * Behavioural contract for Layer 3 (local session cache).
 *
 * Purpose: keep the UI usable while the dongle drops out. The cache holds the
 * last-known good SystemStatus so pages can render immediately and mark the
 * data as `stale` instead of going blank.
 */
export interface SessionCacheStore {
  /** Store a fresh, live reading. */
  put(status: SystemStatus): void

  /** Last snapshot, or null if nothing has been cached this session. */
  getLast(): CachedSnapshot | null

  /** Drop everything (e.g. on a new session). */
  clear(): void
}
