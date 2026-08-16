import { BYTETRACK_PARAM_SPECS, type ByteTrackConfig } from '@shared/types'
import type { TrackingConfigClient } from './types'

const DEFAULTS: ByteTrackConfig = BYTETRACK_PARAM_SPECS.reduce(
  (acc, spec) => ({ ...acc, [spec.key]: spec.default }),
  {} as ByteTrackConfig
)

/**
 * In-memory mock of the Pi's ByteTrack config — lets the Tracking Tuner page
 * work end-to-end before /api/tracking/config exists on server.py.
 *
 * ⚠️ State resets on every app restart on purpose: once the real endpoint
 * exists, the tracker process on the Pi is the source of truth, not this
 * client, so nothing here should look persistent.
 */
export class MockTrackingConfigClient implements TrackingConfigClient {
  private current: ByteTrackConfig = { ...DEFAULTS }

  async getConfig(): Promise<ByteTrackConfig> {
    return { ...this.current }
  }

  async applyConfig(next: ByteTrackConfig): Promise<ByteTrackConfig> {
    this.current = clamp(next)
    return { ...this.current }
  }

  async resetConfig(): Promise<ByteTrackConfig> {
    this.current = { ...DEFAULTS }
    return { ...this.current }
  }
}

/** Mirrors the validation the real Pi endpoint must also do — never trust the caller. */
function clamp(cfg: ByteTrackConfig): ByteTrackConfig {
  const out = { ...cfg }
  for (const spec of BYTETRACK_PARAM_SPECS) {
    out[spec.key] = Math.min(spec.max, Math.max(spec.min, out[spec.key]))
  }
  return out
}
