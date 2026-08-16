import type {
  SystemStatus,
  MaskStats,
  SystemInfo,
  PmSample,
  MaskBucket,
  StepperMotorStatus,
  StepperMoveRequest,
  StepperHomeRequest,
  StepperTeachPoint,
  StepperSequenceRequest,
  SystemDiagnostics,
  EventLogEntry,
  AutomationRulesConfig,
  CalibrationConfig
} from '@shared/types'
import type { ApiClient } from './types'

/**
 * REAL REST client to server.py on the Pi.
 *
 * Runs in the main process, so it is not subject to browser CORS. Enable via
 * `useMockApi: false` in src/main/config.ts. The JSON server.py returns is
 * assumed to already match the shared types (verified schema).
 */
export class HttpApiClient implements ApiClient {
  constructor(private readonly baseUrl: string) {}

  async getStatus(): Promise<SystemStatus> {
    const res = await fetch(`${this.baseUrl}/api/status`)
    if (!res.ok) {
      throw new Error(`server.py /api/status returned ${res.status}`)
    }
    return (await res.json()) as SystemStatus
  }

  async getMaskStats(hours: number): Promise<MaskStats> {
    const res = await fetch(`${this.baseUrl}/api/mask-stats?hours=${encodeURIComponent(hours)}`)
    if (!res.ok) {
      // 422 = server rejected the hours param (out of 0.01–720, or non-numeric).
      throw new Error(`server.py /api/mask-stats returned ${res.status}`)
    }
    return (await res.json()) as MaskStats
  }

  /**
   * ⚠️ Requires a `/api/system/info` endpoint on server.py. Not implemented
   * there yet — this will 404 until it is added.
   * See docs/pi-system-info-endpoint.md for the payload and a Python sketch.
   */
  async getSystemInfo(): Promise<SystemInfo> {
    const res = await fetch(`${this.baseUrl}/api/system/info`)
    if (!res.ok) {
      throw new Error(`server.py /api/system/info returned ${res.status}`)
    }
    return (await res.json()) as SystemInfo
  }

  /**
   * ⚠️ Requires a `/api/pm-history?hours=N` endpoint on server.py returning
   * PmSample[] (oldest → newest). Not implemented there yet — 404 until added.
   * The real /api/status has a `pm_trend` key that may already hold this;
   * see docs/pi-pm-history-endpoint.md.
   */
  async getPmHistory(hours: number): Promise<PmSample[]> {
    const res = await fetch(`${this.baseUrl}/api/pm-history?hours=${encodeURIComponent(hours)}`)
    if (!res.ok) {
      throw new Error(`server.py /api/pm-history returned ${res.status}`)
    }
    return (await res.json()) as PmSample[]
  }

  /**
   * ⚠️ Requires a `/api/mask-history?hours=N` endpoint on server.py returning
   * MaskBucket[] (oldest → newest). Not implemented there yet — 404 until added.
   * See docs/pi-mask-history-endpoint.md.
   */
  async getMaskHistory(hours: number): Promise<MaskBucket[]> {
    const res = await fetch(`${this.baseUrl}/api/mask-history?hours=${encodeURIComponent(hours)}`)
    if (!res.ok) {
      throw new Error(`server.py /api/mask-history returned ${res.status}`)
    }
    return (await res.json()) as MaskBucket[]
  }

  async getStepperStatus(): Promise<StepperMotorStatus> {
    const res = await fetch(`${this.baseUrl}/api/motor/status`)
    if (!res.ok) {
      throw new Error(`server.py /api/motor/status returned ${res.status}`)
    }
    return (await res.json()) as StepperMotorStatus
  }

  async moveStepper(request: StepperMoveRequest): Promise<StepperMotorStatus> {
    return this.postMotor('/api/motor/move', request)
  }

  async stopStepper(): Promise<StepperMotorStatus> {
    return this.postMotor('/api/motor/stop')
  }

  async homeStepper(request: StepperHomeRequest): Promise<StepperMotorStatus> {
    return this.postMotor('/api/motor/home', request)
  }

  async saveStepperTeachPoint(point: StepperTeachPoint): Promise<StepperTeachPoint> {
    const res = await fetch(`${this.baseUrl}/api/motor/teach-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(point)
    })
    if (!res.ok) {
      throw new Error(`server.py /api/motor/teach-points returned ${res.status}`)
    }
    return (await res.json()) as StepperTeachPoint
  }

  async playStepperSequence(request: StepperSequenceRequest): Promise<StepperMotorStatus> {
    return this.postMotor('/api/motor/sequences/play', request)
  }

  async getDiagnostics(): Promise<SystemDiagnostics> {
    const res = await fetch(`${this.baseUrl}/api/diagnostics`)
    if (!res.ok) {
      throw new Error(`server.py /api/diagnostics returned ${res.status}`)
    }
    return (await res.json()) as SystemDiagnostics
  }

  async getEventLogs(limit: number): Promise<EventLogEntry[]> {
    const res = await fetch(`${this.baseUrl}/api/event-logs?limit=${encodeURIComponent(limit)}`)
    if (!res.ok) {
      throw new Error(`server.py /api/event-logs returned ${res.status}`)
    }
    return (await res.json()) as EventLogEntry[]
  }

  async getAutomationRules(): Promise<AutomationRulesConfig> {
    const res = await fetch(`${this.baseUrl}/api/automation/rules`)
    if (!res.ok) {
      throw new Error(`server.py /api/automation/rules returned ${res.status}`)
    }
    return (await res.json()) as AutomationRulesConfig
  }

  async applyAutomationRules(next: AutomationRulesConfig): Promise<AutomationRulesConfig> {
    return this.putJson('/api/automation/rules', next)
  }

  async resetAutomationRules(): Promise<AutomationRulesConfig> {
    return this.postJson('/api/automation/rules/reset')
  }

  async getCalibration(): Promise<CalibrationConfig> {
    const res = await fetch(`${this.baseUrl}/api/calibration`)
    if (!res.ok) {
      throw new Error(`server.py /api/calibration returned ${res.status}`)
    }
    return (await res.json()) as CalibrationConfig
  }

  async applyCalibration(next: CalibrationConfig): Promise<CalibrationConfig> {
    return this.putJson('/api/calibration', next)
  }

  async resetCalibration(): Promise<CalibrationConfig> {
    return this.postJson('/api/calibration/reset')
  }

  private async postMotor(path: string, body?: unknown): Promise<StepperMotorStatus> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: body == null ? undefined : { 'Content-Type': 'application/json' },
      body: body == null ? undefined : JSON.stringify(body)
    })
    if (!res.ok) {
      throw new Error(`server.py ${path} returned ${res.status}`)
    }
    return (await res.json()) as StepperMotorStatus
  }

  private async putJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      throw new Error(`server.py ${path} returned ${res.status}`)
    }
    return (await res.json()) as T
  }

  private async postJson<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: body == null ? undefined : { 'Content-Type': 'application/json' },
      body: body == null ? undefined : JSON.stringify(body)
    })
    if (!res.ok) {
      throw new Error(`server.py ${path} returned ${res.status}`)
    }
    return (await res.json()) as T
  }
}
