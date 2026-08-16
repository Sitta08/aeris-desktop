import { config } from '../../config'
import type { ConnectionProvider } from './types'
import { MockConnection } from './MockConnection'
import { Esp32Connection } from './Esp32Connection'

export type { ConnectionProvider } from './types'

/**
 * Factory — the single place that decides mock vs. real.
 * The rest of the app depends only on the ConnectionProvider interface.
 */
export function createConnectionProvider(): ConnectionProvider {
  return config.useMockConnection ? new MockConnection() : new Esp32Connection()
}
