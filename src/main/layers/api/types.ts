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

/**
 * Behavioural contract for Layer 2 (REST client to server.py on the Pi).
 *
 * Real traffic is tunnelled through the dongle, but from the app's point of
 * view this is just "fetch from the backend". Mock and HTTP implementations
 * both satisfy this interface.
 */
export interface ApiClient {
  /** GET /api/status — throws if the backend is unreachable. */
  getStatus(): Promise<SystemStatus>

  /**
   * GET /api/mask-stats?hours=N — windowed mask-compliance counts.
   * @param hours 0.01–720 (server rejects out-of-range / non-numeric with 422).
   */
  getMaskStats(hours: number): Promise<MaskStats>

  /**
   * GET /api/system/info — Pi load/temps, AI HAT+ health, ambient sensor.
   * ⚠️ Endpoint not implemented on server.py yet (mock only for now).
   */
  getSystemInfo(): Promise<SystemInfo>

  /**
   * PM2.5 time series over the last N hours (oldest → newest).
   * ⚠️ Endpoint not implemented on server.py yet (mock only for now).
   */
  getPmHistory(hours: number): Promise<PmSample[]>

  /**
   * Mask-detection counts bucketed over the last N hours (oldest → newest).
   * ⚠️ Endpoint not implemented on server.py yet (mock only for now).
   */
  getMaskHistory(hours: number): Promise<MaskBucket[]>

  /** GET /api/motor/status — Arduino/CNC Shield/A4988 stepper state. */
  getStepperStatus(): Promise<StepperMotorStatus>

  /** POST /api/motor/move — relative move in steps. */
  moveStepper(request: StepperMoveRequest): Promise<StepperMotorStatus>

  /** POST /api/motor/stop — stop current motion as soon as firmware allows. */
  stopStepper(): Promise<StepperMotorStatus>

  /** POST /api/motor/home — run the configured homing routine for one axis. */
  homeStepper(request: StepperHomeRequest): Promise<StepperMotorStatus>

  /** POST /api/motor/teach-points — persist or update a taught waypoint. */
  saveStepperTeachPoint(point: StepperTeachPoint): Promise<StepperTeachPoint>

  /** POST /api/motor/sequences/play — play taught waypoints in order. */
  playStepperSequence(request: StepperSequenceRequest): Promise<StepperMotorStatus>

  /** GET /api/diagnostics — health checks for Pi services and attached hardware. */
  getDiagnostics(): Promise<SystemDiagnostics>

  /** GET /api/event-logs — recent system/operator events. */
  getEventLogs(limit: number): Promise<EventLogEntry[]>

  /** GET /api/automation/rules — no-mask/improper action rules. */
  getAutomationRules(): Promise<AutomationRulesConfig>

  /** PUT /api/automation/rules — persist and apply automation rules. */
  applyAutomationRules(next: AutomationRulesConfig): Promise<AutomationRulesConfig>

  /** POST /api/automation/rules/reset — restore automation defaults. */
  resetAutomationRules(): Promise<AutomationRulesConfig>

  /** GET /api/calibration — detection/camera/PM calibration values. */
  getCalibration(): Promise<CalibrationConfig>

  /** PUT /api/calibration — persist and apply calibration values. */
  applyCalibration(next: CalibrationConfig): Promise<CalibrationConfig>

  /** POST /api/calibration/reset — restore calibration defaults. */
  resetCalibration(): Promise<CalibrationConfig>
}
