import { config } from '../../config'
import type { TrackingConfigClient } from './types'
import { MockTrackingConfigClient } from './MockTrackingConfigClient'
import { HttpTrackingConfigClient } from './HttpTrackingConfigClient'

export type { TrackingConfigClient } from './types'

/** Factory — the single place that decides mock vs. real tracking-config client. */
export function createTrackingConfigClient(): TrackingConfigClient {
  return config.useMockTracking
    ? new MockTrackingConfigClient()
    : new HttpTrackingConfigClient(config.piBaseUrl)
}
