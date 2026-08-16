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
 * Real backend for everything that's wired up, mock for the bits whose
 * hardware isn't connected yet — chosen per-feature so a half-connected Pi
 * still shows live data where it can and believable demo data where it can't.
 *
 * Which features are mocked is decided by the flags in src/main/config.ts
 * (`useMockPm`, `useMockMotor`) and mirrored in docs/MOCK_STATUS.md.
 */
export class HybridApiClient implements ApiClient {
  constructor(
    private readonly real: ApiClient,
    private readonly mock: ApiClient,
    private readonly opts: {
      pm: boolean
      motor: boolean
      diagnostics: boolean
      eventLogs: boolean
      automation: boolean
      calibration: boolean
    }
  ) {}

  /**
   * Mask tallies + node status come from the real Pi; only pm25 is overlaid
   * from the mock when the PM sensor isn't connected (so the tile isn't stuck
   * at a dead 0). If PM is real, the whole status is passed through untouched.
   */
  async getStatus(): Promise<SystemStatus> {
    if (!this.opts.pm) return this.real.getStatus()
    const [real, mock] = await Promise.all([this.real.getStatus(), this.mock.getStatus()])
    return { ...real, state: { ...real.state, pm25: mock.state.pm25 } }
  }

  getMaskStats(hours: number): Promise<MaskStats> {
    return this.real.getMaskStats(hours)
  }

  getSystemInfo(): Promise<SystemInfo> {
    return this.real.getSystemInfo()
  }

  getMaskHistory(hours: number): Promise<MaskBucket[]> {
    return this.real.getMaskHistory(hours)
  }

  getPmHistory(hours: number): Promise<PmSample[]> {
    return (this.opts.pm ? this.mock : this.real).getPmHistory(hours)
  }

  // ── stepper (mocked until the Arduino/CNC shield is connected) ──
  private get motor(): ApiClient {
    return this.opts.motor ? this.mock : this.real
  }

  getStepperStatus(): Promise<StepperMotorStatus> {
    return this.motor.getStepperStatus()
  }

  moveStepper(request: StepperMoveRequest): Promise<StepperMotorStatus> {
    return this.motor.moveStepper(request)
  }

  stopStepper(): Promise<StepperMotorStatus> {
    return this.motor.stopStepper()
  }

  homeStepper(request: StepperHomeRequest): Promise<StepperMotorStatus> {
    return this.motor.homeStepper(request)
  }

  saveStepperTeachPoint(point: StepperTeachPoint): Promise<StepperTeachPoint> {
    return this.motor.saveStepperTeachPoint(point)
  }

  playStepperSequence(request: StepperSequenceRequest): Promise<StepperMotorStatus> {
    return this.motor.playStepperSequence(request)
  }

  getDiagnostics(): Promise<SystemDiagnostics> {
    return (this.opts.diagnostics ? this.mock : this.real).getDiagnostics()
  }

  getEventLogs(limit: number): Promise<EventLogEntry[]> {
    return (this.opts.eventLogs ? this.mock : this.real).getEventLogs(limit)
  }

  private get automation(): ApiClient {
    return this.opts.automation ? this.mock : this.real
  }

  getAutomationRules(): Promise<AutomationRulesConfig> {
    return this.automation.getAutomationRules()
  }

  applyAutomationRules(next: AutomationRulesConfig): Promise<AutomationRulesConfig> {
    return this.automation.applyAutomationRules(next)
  }

  resetAutomationRules(): Promise<AutomationRulesConfig> {
    return this.automation.resetAutomationRules()
  }

  private get calibration(): ApiClient {
    return this.opts.calibration ? this.mock : this.real
  }

  getCalibration(): Promise<CalibrationConfig> {
    return this.calibration.getCalibration()
  }

  applyCalibration(next: CalibrationConfig): Promise<CalibrationConfig> {
    return this.calibration.applyCalibration(next)
  }

  resetCalibration(): Promise<CalibrationConfig> {
    return this.calibration.resetCalibration()
  }
}
