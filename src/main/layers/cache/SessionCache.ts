import type { CachedSnapshot, SystemStatus } from '@shared/types'
import type { SessionCacheStore } from './types'

/**
 * In-memory session cache.
 *
 * Deliberately simple for now — a single last-known snapshot plus the time it
 * was cached. When you need history (for Graphs) or persistence across
 * restarts, this is the spot to swap in a ring buffer or an on-disk store
 * behind the same SessionCacheStore interface.
 */
export class SessionCache implements SessionCacheStore {
  private last: SystemStatus | null = null
  private lastAt: string | null = null

  put(status: SystemStatus): void {
    this.last = status
    this.lastAt = new Date().toISOString()
  }

  getLast(): CachedSnapshot | null {
    if (!this.last || !this.lastAt) return null
    return {
      status: this.last,
      // If the live source is currently unavailable the caller decides
      // staleness; here we simply report the cached copy.
      stale: true,
      cachedAt: this.lastAt
    }
  }

  clear(): void {
    this.last = null
    this.lastAt = null
  }
}
