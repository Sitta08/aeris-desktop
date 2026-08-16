import { config } from '../../config'
import type { ApiClient } from './types'
import { MockApiClient } from './MockApiClient'
import { HttpApiClient } from './HttpApiClient'
import { HybridApiClient } from './HybridApiClient'

export type { ApiClient } from './types'

/**
 * Factory — the single place that decides mock vs. real API client.
 *
 *  • useMockApi true            → everything mock (offline dev)
 *  • all hardware connected     → everything real (HttpApiClient)
 *  • some hardware not wired yet → Hybrid: real where possible, mock for the
 *    features flagged in config (useMockPm / useMockMotor / diagnostics / logs)
 */
export function createApiClient(): ApiClient {
  if (config.useMockApi) return new MockApiClient()

  const http = new HttpApiClient(config.piBaseUrl)
  if (
    !config.useMockPm &&
    !config.useMockMotor &&
    !config.useMockDiagnostics &&
    !config.useMockEventLogs &&
    !config.useMockAutomation &&
    !config.useMockCalibration
  ) {
    return http
  }

  return new HybridApiClient(http, new MockApiClient(), {
    pm: config.useMockPm,
    motor: config.useMockMotor,
    diagnostics: config.useMockDiagnostics,
    eventLogs: config.useMockEventLogs,
    automation: config.useMockAutomation,
    calibration: config.useMockCalibration
  })
}
