import type { ConnectionStatus } from '@shared/types'
import type { ConnectionProvider } from './types'

/**
 * Mock dongle connection — used until a real ESP32-S3 dongle is available.
 *
 * Behaviour:
 *  - connect() succeeds after a short delay and reports fake dongle info.
 *  - once connected, it emits periodic status updates with a jittering
 *    linkQuality so the UI has something live to react to.
 *
 * Swap this out by flipping `useMockConnection` in src/main/config.ts.
 */
export class MockConnection implements ConnectionProvider {
  private status: ConnectionStatus
  private listeners = new Set<(s: ConnectionStatus) => void>()
  private heartbeat?: ReturnType<typeof setInterval>

  constructor() {
    this.status = {
      state: 'disconnected',
      detail: 'Mock dongle (no hardware)',
      updatedAt: new Date().toISOString()
    }
  }

  getStatus(): ConnectionStatus {
    return this.status
  }

  async connect(): Promise<ConnectionStatus> {
    this.update({ state: 'connecting', detail: 'Handshaking with mock dongle…' })
    await delay(600)

    this.update({
      state: 'connected',
      detail: 'Mock dongle · virtual link',
      dongle: {
        model: 'LILYGO T-Display-S3 (mock)',
        firmware: '0.0.1-mock',
        linkQuality: 92
      },
      error: undefined
    })

    this.startHeartbeat()
    return this.status
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat()
    this.update({
      state: 'disconnected',
      detail: 'Mock dongle (no hardware)',
      dongle: undefined
    })
  }

  onStatusChange(listener: (s: ConnectionStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispose(): void {
    this.stopHeartbeat()
    this.listeners.clear()
  }

  // ── internals ──────────────────────────────────────────────

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeat = setInterval(() => {
      if (this.status.state !== 'connected') return
      const jitter = 80 + Math.round(Math.random() * 20) // 80..100
      this.update({
        dongle: { ...this.status.dongle!, linkQuality: jitter }
      })
    }, 3000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = undefined
  }

  private update(patch: Partial<ConnectionStatus>): void {
    this.status = {
      ...this.status,
      ...patch,
      updatedAt: new Date().toISOString()
    }
    for (const l of this.listeners) l(this.status)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
