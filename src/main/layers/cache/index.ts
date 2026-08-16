import type { SessionCacheStore } from './types'
import { SessionCache } from './SessionCache'

export type { SessionCacheStore } from './types'

/** Factory for the session cache. Only one implementation for now. */
export function createSessionCache(): SessionCacheStore {
  return new SessionCache()
}
