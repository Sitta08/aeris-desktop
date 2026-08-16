import type { ConnectionStatus } from '@shared/types'

/**
 * Behavioural contract for Layer 1 (dongle connection).
 *
 * The ESP32-S3 (LILYGO T-Display-S3) dongle is the ONLY path from the app to
 * the Pi — there is no fallback transport. Every implementation (mock today,
 * real serial tomorrow) must satisfy this interface so the rest of the app
 * never needs to know which one is active.
 */
export interface ConnectionProvider {
  /** Current cached status without touching hardware. */
  getStatus(): ConnectionStatus

  /** Attempt to establish/verify the link. Resolves with the new status. */
  connect(): Promise<ConnectionStatus>

  /** Tear the link down. */
  disconnect(): Promise<void>

  /**
   * Subscribe to status changes (connect, drop, error, link-quality updates).
   * Returns an unsubscribe function.
   */
  onStatusChange(listener: (status: ConnectionStatus) => void): () => void

  /** Release resources (timers, serial handles). Called on app quit. */
  dispose(): void
}
