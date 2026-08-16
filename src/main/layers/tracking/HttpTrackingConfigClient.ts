import type { ByteTrackConfig } from '@shared/types'
import type { TrackingConfigClient } from './types'

/**
 * REAL client for the Pi's ByteTrack tuning endpoint.
 *
 * `/api/tracking/config` is implemented + verified on server.py (11-field
 * contract). The Pi's response also carries additive keys (apply_status,
 * updated_at) which we ignore — the UI only reads the known ByteTrackConfig
 * fields. See docs/pi-tracking-config-endpoint.md. Enabled via
 * `useMockTracking: false` in src/main/config.ts.
 */
export class HttpTrackingConfigClient implements TrackingConfigClient {
  constructor(private readonly baseUrl: string) {}

  async getConfig(): Promise<ByteTrackConfig> {
    const res = await fetch(`${this.baseUrl}/api/tracking/config`)
    if (!res.ok) {
      throw new Error(`server.py /api/tracking/config returned ${res.status}`)
    }
    return (await res.json()) as ByteTrackConfig
  }

  async applyConfig(next: ByteTrackConfig): Promise<ByteTrackConfig> {
    const res = await fetch(`${this.baseUrl}/api/tracking/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next)
    })
    if (!res.ok) {
      throw new Error(`server.py /api/tracking/config (apply) returned ${res.status}`)
    }
    return (await res.json()) as ByteTrackConfig
  }

  async resetConfig(): Promise<ByteTrackConfig> {
    const res = await fetch(`${this.baseUrl}/api/tracking/config/reset`, { method: 'POST' })
    if (!res.ok) {
      throw new Error(`server.py /api/tracking/config/reset returned ${res.status}`)
    }
    return (await res.json()) as ByteTrackConfig
  }
}
