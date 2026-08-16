import type { ByteTrackConfig } from '@shared/types'

/**
 * Behavioural contract for the tracking-config layer (the Pi's ByteTrack
 * tuner). Mock and HTTP implementations both satisfy this interface, so the
 * Tracking Tuner page never needs to know which one is active. Swap via
 * `useMockTracking` in src/main/config.ts once /api/tracking/config exists
 * on the Pi (see docs/pi-tracking-config-endpoint.md).
 */
export interface TrackingConfigClient {
  /** Current tuning values. */
  getConfig(): Promise<ByteTrackConfig>

  /** Apply new values. Returns the (possibly clamped) values that took effect. */
  applyConfig(next: ByteTrackConfig): Promise<ByteTrackConfig>

  /** Reset to the tracker's defaults. Returns the restored values. */
  resetConfig(): Promise<ByteTrackConfig>
}
