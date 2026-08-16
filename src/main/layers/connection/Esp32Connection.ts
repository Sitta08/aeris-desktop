import type { ConnectionStatus } from '@shared/types'
import type { ConnectionProvider } from './types'

/**
 * REAL dongle connection over USB serial to the ESP32-S3 (LILYGO T-Display-S3).
 *
 * ⚠️ STUB — not implemented yet. When the hardware arrives:
 *   1. add `serialport` to dependencies:  npm i serialport
 *   2. open the port, run the handshake, parse the framed protocol here
 *   3. flip `useMockConnection` to false in src/main/config.ts
 *
 * Because this satisfies the same ConnectionProvider interface as
 * MockConnection, nothing in ipc.ts / preload / renderer has to change.
 */
export class Esp32Connection implements ConnectionProvider {
  getStatus(): ConnectionStatus {
    return {
      state: 'disconnected',
      detail: 'ESP32 serial (not implemented)',
      updatedAt: new Date().toISOString()
    }
  }

  async connect(): Promise<ConnectionStatus> {
    throw new Error('Esp32Connection.connect() not implemented — using MockConnection for now.')
  }

  async disconnect(): Promise<void> {
    // no-op until implemented
  }

  onStatusChange(): () => void {
    return () => {}
  }

  dispose(): void {
    // no-op
  }
}
