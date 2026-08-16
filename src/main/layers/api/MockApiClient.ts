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
  DiagnosticCheck,
  DiagnosticState,
  EventLogEntry,
  AutomationRulesConfig,
  CalibrationConfig
} from '@shared/types'
import type { ApiClient } from './types'

/**
 * Mock API client — returns believable fake data matching server.py's real
 * schema exactly. PM2.5 drifts and today's tallies creep up over the session
 * so the Dashboard has something live to show.
 *
 * Swap for HttpApiClient by flipping `useMockApi` in src/main/config.ts.
 */
export class MockApiClient implements ApiClient {
  private pm = 22 // µg/m³
  private tallyOn = 128 // masked passes so far "today"
  private tallyOff = 34 // unmasked passes so far "today"
  private cpuTemp = 52 // °C
  private cpuUsage = 24 // %
  private memUsed = 2600 // MB of 8 GB
  private hailoTemp = 47 // °C
  private hailoUsage = 35 // %
  private ambient = 29.5 // °C
  private humidity = 62 // %
  private stepperPosition = 0
  private stepperPositions = { x: 0, y: 0, z: 0 }
  private stepperMoving = false
  private stepperLastCommand: string | null = null
  private teachPoints = new Map<string, StepperTeachPoint>()
  private automationRules: AutomationRulesConfig = defaultAutomationRules()
  private calibration: CalibrationConfig = defaultCalibration()

  async getStatus(): Promise<SystemStatus> {
    // PM2.5 random walk, clamped to a sane range.
    this.pm = clamp(Math.round(this.pm + (Math.random() - 0.5) * 6), 3, 180)

    // tallies only ever grow, and mostly with masks.
    if (Math.random() < 0.7) this.tallyOn += Math.floor(Math.random() * 2)
    if (Math.random() < 0.25) this.tallyOff += Math.floor(Math.random() * 2)

    return {
      state: {
        pm25: this.pm,
        mask_tally_on: this.tallyOn,
        mask_tally_off: this.tallyOff
      },
      nodes_status: {
        pm25_sensor: true,
        voice_tts: true,
        data_logger: true,
        // one node deliberately offline so the status strip shows both states.
        external_data: false
      }
    }
  }

  async getMaskStats(hours: number): Promise<MaskStats> {
    const passesPerHour = 42
    const total = Math.max(0, Math.round(passesPerHour * hours * (0.85 + Math.random() * 0.3)))
    // derive the minority buckets first so mask_count = total - rest never goes negative.
    const no_mask_count = Math.round(total * (0.12 + Math.random() * 0.06))
    const improper_count = Math.round(total * (0.05 + Math.random() * 0.05))
    const mask_count = Math.max(0, total - no_mask_count - improper_count)

    return {
      window_hours: hours,
      total_passes: total,
      mask_count,
      no_mask_count,
      improper_count
    }
  }

  async getSystemInfo(): Promise<SystemInfo> {
    // gentle drift so the card visibly updates
    this.cpuTemp = clamp(this.cpuTemp + (Math.random() - 0.5) * 2.5, 38, 82)
    this.cpuUsage = clamp(this.cpuUsage + (Math.random() - 0.5) * 12, 3, 96)
    this.memUsed = clamp(this.memUsed + (Math.random() - 0.5) * 120, 1200, 7200)
    this.hailoTemp = clamp(this.hailoTemp + (Math.random() - 0.5) * 2, 35, 78)
    this.hailoUsage = clamp(this.hailoUsage + (Math.random() - 0.5) * 18, 0, 98)
    this.ambient = clamp(this.ambient + (Math.random() - 0.5) * 0.4, 22, 38)
    this.humidity = clamp(this.humidity + (Math.random() - 0.5) * 1.5, 35, 85)

    const memTotal = 8192 // Pi 5 / 8 GB

    return {
      cpu_temp_c: round1(this.cpuTemp),
      cpu_usage_pct: Math.round(this.cpuUsage),

      mem_usage_pct: Math.round((this.memUsed / memTotal) * 100),
      mem_used_mb: Math.round(this.memUsed),
      mem_total_mb: memTotal,

      hailo_present: true,
      hailo_temp_c: round1(this.hailoTemp),
      hailo_usage_pct: Math.round(this.hailoUsage),

      ambient_temp_c: round1(this.ambient),
      humidity_pct: Math.round(this.humidity)
    }
  }

  async getPmHistory(hours: number): Promise<PmSample[]> {
    const points = pointCount(hours)
    const stepMs = (hours * 3_600_000) / (points - 1)
    const now = Date.now()

    // random walk with mild mean-reversion + a slow sine for a day-ish rhythm
    let v = 18 + Math.random() * 18
    const out: PmSample[] = []
    for (let i = 0; i < points; i++) {
      const rhythm = Math.sin((i / points) * Math.PI * 4) * 6
      v = clamp(v + (Math.random() - 0.5) * 10 + (rhythm - (v - 26)) * 0.03, 4, 172)
      out.push({
        t: new Date(now - (points - 1 - i) * stepMs).toISOString(),
        pm25: Math.round(v)
      })
    }
    return out
  }

  async getMaskHistory(hours: number): Promise<MaskBucket[]> {
    const points = pointCount(hours)
    const stepMs = (hours * 3_600_000) / (points - 1)
    const bucketHours = hours / points
    const passesPerHour = 42
    const now = Date.now()

    let compliance = 0.82 // fraction masked, drifts over time
    const out: MaskBucket[] = []
    for (let i = 0; i < points; i++) {
      compliance = clamp(compliance + (Math.random() - 0.5) * 0.06, 0.5, 0.98)
      const total = Math.max(1, Math.round(passesPerHour * bucketHours * (0.7 + Math.random() * 0.6)))
      const mask = Math.round(total * compliance)
      const improper = Math.round((total - mask) * (0.3 + Math.random() * 0.3))
      const no_mask = Math.max(0, total - mask - improper)
      out.push({
        t: new Date(now - (points - 1 - i) * stepMs).toISOString(),
        total,
        mask,
        no_mask,
        improper
      })
    }
    return out
  }

  async getStepperStatus(): Promise<StepperMotorStatus> {
    return this.stepperStatus()
  }

  async moveStepper(request: StepperMoveRequest): Promise<StepperMotorStatus> {
    const signedSteps = request.direction === 'cw' ? request.steps : -request.steps
    this.stepperPositions[request.axis] += signedSteps
    this.stepperPosition += signedSteps
    this.stepperMoving = false
    this.stepperLastCommand = `${request.axis.toUpperCase()} ${request.direction} ${request.steps} steps @ ${request.speed_sps} sps`
    return this.stepperStatus()
  }

  async stopStepper(): Promise<StepperMotorStatus> {
    this.stepperMoving = false
    this.stepperLastCommand = 'STOP'
    return this.stepperStatus()
  }

  async homeStepper(request: StepperHomeRequest): Promise<StepperMotorStatus> {
    this.stepperPositions[request.axis] = 0
    this.stepperPosition = 0
    this.stepperMoving = false
    this.stepperLastCommand = `${request.axis.toUpperCase()} HOME @ ${request.speed_sps} sps`
    return this.stepperStatus()
  }

  async saveStepperTeachPoint(point: StepperTeachPoint): Promise<StepperTeachPoint> {
    this.teachPoints.set(point.id, point)
    this.stepperLastCommand = `SAVE ${point.name}`
    return point
  }

  async playStepperSequence(request: StepperSequenceRequest): Promise<StepperMotorStatus> {
    const last = request.points.at(-1)
    if (last) {
      this.stepperPositions = { ...last.positions }
      this.stepperPosition = last.positions.x
    }
    this.stepperMoving = false
    this.stepperLastCommand = `PLAY ${request.name} x${request.repeat} (${request.points.length} points)`
    return this.stepperStatus()
  }

  async getDiagnostics(): Promise<SystemDiagnostics> {
    const now = new Date().toISOString()
    const checks: DiagnosticCheck[] = [
      {
        id: 'pi-api',
        label: 'Pi API',
        state: 'ok',
        detail: 'server.py responded on /api/status',
        updated_at: now,
        latency_ms: 38
      },
      {
        id: 'camera',
        label: 'Camera',
        state: 'ok',
        detail: 'Camera stream active',
        updated_at: now,
        latency_ms: 12
      },
      {
        id: 'hailo',
        label: 'Hailo-8L',
        state: 'ok',
        detail: 'AI accelerator detected',
        updated_at: now,
        latency_ms: 24
      },
      {
        id: 'pm25',
        label: 'PM2.5 Sensor',
        state: 'warn',
        detail: 'Sensor endpoint exists, hardware not connected',
        updated_at: now,
        latency_ms: null
      },
      {
        id: 'arduino',
        label: 'Arduino / Stepper',
        state: 'warn',
        detail: 'Motor endpoints are mocked until Arduino is connected',
        updated_at: now,
        latency_ms: null
      },
      {
        id: 'database',
        label: 'SQLite Database',
        state: 'ok',
        detail: 'aeris_data.db writable',
        updated_at: now,
        latency_ms: 7
      },
      {
        id: 'disk',
        label: 'Disk Space',
        state: 'ok',
        detail: '68% free on root filesystem',
        updated_at: now,
        latency_ms: 4
      },
      {
        id: 'dongle',
        label: 'ESP32-S3 Dongle',
        state: 'unknown',
        detail: 'Desktop connection layer is currently mocked',
        updated_at: now,
        latency_ms: null
      }
    ]

    return {
      summary: summarizeDiagnostics(checks, now),
      checks
    }
  }

  async getEventLogs(limit: number): Promise<EventLogEntry[]> {
    const safeLimit = Math.max(1, Math.min(200, Math.round(limit || 100)))
    const now = Date.now()
    const items: EventLogEntry[] = [
      {
        id: 'evt-001',
        t: new Date(now - 45_000).toISOString(),
        level: 'info',
        category: 'system',
        message: 'Diagnostics snapshot completed',
        detail: '8 checks collected'
      },
      {
        id: 'evt-002',
        t: new Date(now - 4 * 60_000).toISOString(),
        level: 'warn',
        category: 'motor',
        message: 'Stepper running in mock mode',
        detail: 'useMockMotor is true until Arduino/CNC Shield is connected'
      },
      {
        id: 'evt-003',
        t: new Date(now - 7 * 60_000).toISOString(),
        level: 'info',
        category: 'auth',
        message: 'Admin session restored',
        detail: 'JWT kept in main-process safeStorage'
      },
      {
        id: 'evt-004',
        t: new Date(now - 12 * 60_000).toISOString(),
        level: 'info',
        category: 'mask',
        message: 'Mask compliance bucket updated',
        detail: 'Latest graph sample received'
      },
      {
        id: 'evt-005',
        t: new Date(now - 18 * 60_000).toISOString(),
        level: 'warn',
        category: 'api',
        message: 'PM2.5 data served from mock client',
        detail: 'PM sensor hardware not connected yet'
      },
      {
        id: 'evt-006',
        t: new Date(now - 24 * 60_000).toISOString(),
        level: 'error',
        category: 'tracking',
        message: 'Tracking config endpoint missing on Pi',
        detail: '/api/tracking/config is still mocked in the desktop app'
      }
    ]
    return items.slice(0, safeLimit)
  }

  async getAutomationRules(): Promise<AutomationRulesConfig> {
    return cloneWithUpdatedAt(this.automationRules)
  }

  async applyAutomationRules(next: AutomationRulesConfig): Promise<AutomationRulesConfig> {
    this.automationRules = normalizeAutomationRules(next)
    return withApplyStatus(this.automationRules, {
      message: 'Automation rules applied',
      detail: 'Mock runtime is now using the returned rules'
    })
  }

  async resetAutomationRules(): Promise<AutomationRulesConfig> {
    this.automationRules = defaultAutomationRules()
    return withApplyStatus(this.automationRules, {
      message: 'Automation rules reset',
      detail: 'Mock runtime restored default rules'
    })
  }

  async getCalibration(): Promise<CalibrationConfig> {
    return cloneWithUpdatedAt(this.calibration)
  }

  async applyCalibration(next: CalibrationConfig): Promise<CalibrationConfig> {
    this.calibration = normalizeCalibration(next)
    return withApplyStatus(this.calibration, {
      message: 'Calibration applied',
      detail: 'Mock runtime is now using the returned thresholds and ROI'
    })
  }

  async resetCalibration(): Promise<CalibrationConfig> {
    this.calibration = defaultCalibration()
    return withApplyStatus(this.calibration, {
      message: 'Calibration reset',
      detail: 'Mock runtime restored default calibration'
    })
  }

  private stepperStatus(): StepperMotorStatus {
    return {
      connected: true,
      axis: 'x',
      position_steps: this.stepperPosition,
      positions: { ...this.stepperPositions },
      moving: this.stepperMoving,
      last_command: this.stepperLastCommand,
      updated_at: new Date().toISOString()
    }
  }
}

function defaultAutomationRules(): AutomationRulesConfig {
  return {
    enabled: true,
    updated_at: new Date().toISOString(),
    rules: {
      no_mask: {
        enabled: true,
        cooldown_sec: 10,
        play_motor_sequence: true,
        sequence_name: 'Mask warning motion',
        trigger_tts: true,
        tts_message: 'กรุณาสวมหน้ากากอนามัย',
        skip_if_motor_busy: true
      },
      improper_mask: {
        enabled: false,
        cooldown_sec: 15,
        play_motor_sequence: false,
        sequence_name: 'Mask warning motion',
        trigger_tts: true,
        tts_message: 'กรุณาสวมหน้ากากให้ถูกต้อง',
        skip_if_motor_busy: true
      }
    }
  }
}

function normalizeAutomationRules(next: AutomationRulesConfig): AutomationRulesConfig {
  const base = defaultAutomationRules()
  return {
    enabled: Boolean(next.enabled),
    updated_at: new Date().toISOString(),
    rules: {
      no_mask: normalizeRule(next.rules?.no_mask ?? base.rules.no_mask),
      improper_mask: normalizeRule(next.rules?.improper_mask ?? base.rules.improper_mask)
    }
  }
}

function normalizeRule(rule: AutomationRulesConfig['rules']['no_mask']) {
  return {
    enabled: Boolean(rule.enabled),
    cooldown_sec: clamp(Math.round(rule.cooldown_sec), 1, 300),
    play_motor_sequence: Boolean(rule.play_motor_sequence),
    sequence_name: String(rule.sequence_name || 'Mask warning motion'),
    trigger_tts: Boolean(rule.trigger_tts),
    tts_message: String(rule.tts_message || ''),
    skip_if_motor_busy: Boolean(rule.skip_if_motor_busy)
  }
}

function defaultCalibration(): CalibrationConfig {
  return {
    detection_confidence: 0.65,
    mask_confidence: 0.65,
    tracker_match_threshold: 0.8,
    roi: { x_pct: 10, y_pct: 8, w_pct: 80, h_pct: 82 },
    updated_at: new Date().toISOString()
  }
}

function normalizeCalibration(next: CalibrationConfig): CalibrationConfig {
  return {
    detection_confidence: round2(clamp(next.detection_confidence, 0.05, 0.99)),
    mask_confidence: round2(clamp(next.mask_confidence, 0.05, 0.99)),
    tracker_match_threshold: round2(clamp(next.tracker_match_threshold, 0.05, 0.99)),
    roi: {
      x_pct: round1(clamp(next.roi?.x_pct ?? 0, 0, 95)),
      y_pct: round1(clamp(next.roi?.y_pct ?? 0, 0, 95)),
      w_pct: round1(clamp(next.roi?.w_pct ?? 100, 5, 100)),
      h_pct: round1(clamp(next.roi?.h_pct ?? 100, 5, 100))
    },
    updated_at: new Date().toISOString()
  }
}

function cloneWithUpdatedAt<T extends { updated_at: string }>(value: T): T {
  return { ...structuredClone(value), updated_at: new Date().toISOString() }
}

function withApplyStatus<T extends { updated_at: string }>(
  value: T,
  status: { message: string; detail: string }
): T {
  const appliedAt = new Date().toISOString()
  return {
    ...cloneWithUpdatedAt(value),
    apply_status: {
      ok: true,
      message: status.message,
      detail: status.detail,
      applied_at: appliedAt
    }
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function summarizeDiagnostics(
  checks: DiagnosticCheck[],
  updatedAt: string
): SystemDiagnostics['summary'] {
  const count = (state: DiagnosticState): number => checks.filter((c) => c.state === state).length
  const error = count('error')
  const warn = count('warn')
  const unknown = count('unknown')
  return {
    state: error > 0 ? 'error' : warn > 0 ? 'warn' : unknown > 0 ? 'unknown' : 'ok',
    ok: count('ok'),
    warn,
    error,
    unknown,
    updated_at: updatedAt
  }
}

/** Sample density per range — dense for short windows, sparse for long ones. */
function pointCount(hours: number): number {
  if (hours <= 1) return 60
  if (hours <= 6) return 72
  if (hours <= 24) return 96
  if (hours <= 168) return 84 // 7 days ≈ every 2h
  return 90 // 30 days ≈ every 8h
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}
