import { config } from '../../config'
import type { AuthClient } from './types'
import { MockAuthClient } from './MockAuthClient'
import { HttpAuthClient } from './HttpAuthClient'

export type { AuthClient, SignupOutcome, LoginOutcome } from './types'

/** Factory — the single place that decides mock vs. real auth backend. */
export function createAuthClient(): AuthClient {
  return config.useMockAuth ? new MockAuthClient() : new HttpAuthClient(config.piBaseUrl)
}
