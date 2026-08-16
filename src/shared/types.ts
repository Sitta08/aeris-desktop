/**
 * Shared data shapes used across the process boundary (main ↔ preload ↔ renderer).
 *
 * These describe DATA only. Behavioural contracts (interfaces the layer
 * implementations must satisfy) live next to each layer under src/main/layers/.
 *
 * ⚠️ Field names below mirror server.py's JSON EXACTLY (snake_case, `pm25`
 * not `pm2_5`). Do not rename them.
 */

/* ────────────────────────────────────────────────────────────
 * Layer 1 — Connection (ESP32-S3 dongle)
 * ──────────────────────────────────────────────────────────── */

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface ConnectionStatus {
  state: ConnectionState
  /** Human-readable detail, e.g. "Mock dongle" or "COM3 / 921600" */
  detail: string
  /** Info about the dongle, present once connected. */
  dongle?: DongleInfo
  /** ISO timestamp of the last status change. */
  updatedAt: string
  /** Present when state === 'error'. */
  error?: string
}

export interface DongleInfo {
  /** e.g. "LILYGO T-Display-S3" */
  model: string
  firmware: string
  /** Signal/link quality 0..100, if the transport reports it. */
  linkQuality?: number
}

/* ────────────────────────────────────────────────────────────
 * Layer 2 — API (server.py REST on the Pi)
 * ──────────────────────────────────────────────────────────── */

/**
 * GET /api/status — the real payload has these top-level keys:
 * official_stats, state, history, mode, screen, pm_trend, nodes_status.
 * Only the fields the desktop app consumes are typed precisely; the rest are
 * marked optional/unknown so the type stays honest without inventing shapes.
 */
export interface SystemStatus {
  state: DeviceState
  nodes_status: NodesStatus
  /** Present in the real payload but not consumed here yet. */
  official_stats?: unknown
  history?: unknown
  mode?: unknown
  screen?: unknown
  pm_trend?: unknown
}

export interface DeviceState {
  /** state.pm25 — latest PM2.5 reading (µg/m³, integer). */
  pm25: number
  /** state.mask_tally_on — live running tally of masked passes TODAY. */
  mask_tally_on: number
  /** state.mask_tally_off — live running tally of unmasked passes TODAY. */
  mask_tally_off: number
  /**
   * ⚠️ DO NOT read state.mask_on / state.mask_off from the real API — they are
   * hardcoded fakes stuck at 50/10 and never update. They are intentionally
   * NOT modelled here so nothing in the app can consume them by accident.
   */
}

export interface NodesStatus {
  pm25_sensor: boolean
  voice_tts: boolean
  data_logger: boolean
  external_data: boolean
}

/**
 * GET /api/mask-stats?hours=N (default N=2, valid range 0.01–720).
 * Windowed mask-compliance counts over the last N hours.
 */
export interface MaskStats {
  window_hours: number
  total_passes: number
  mask_count: number
  no_mask_count: number
  improper_count: number
}

/**
 * One PM2.5 sample in a time series.
 *
 * ⚠️ Served by a not-yet-built endpoint (GET /api/pm-history?hours=N). The
 * real /api/status already carries a `pm_trend` key that MIGHT hold this —
 * check its shape before adding a new endpoint. See docs/pi-pm-history-endpoint.md.
 */
export interface PmSample {
  /** ISO timestamp. */
  t: string
  /** µg/m³. */
  pm25: number
}

/**
 * Mask-detection counts for one time bucket — the time-series companion to
 * MaskStats (which is a single window total).
 *
 * ⚠️ Served by a not-yet-built endpoint (GET /api/mask-history?hours=N).
 * See docs/pi-mask-history-endpoint.md.
 */
export interface MaskBucket {
  /** ISO timestamp at the bucket's centre. */
  t: string
  total: number
  mask: number
  no_mask: number
  improper: number
}

/**
 * Load, temperatures and attached-accelerator health for the Pi.
 *
 * ⚠️ NOT part of the verified /api/status payload — this comes from a separate
 * endpoint (GET /api/system/info) that still has to be added to server.py.
 * Until then the mock client supplies these values.
 * See docs/pi-system-info-endpoint.md.
 *
 * Hardware-dependent fields are nullable so the UI degrades gracefully on a Pi
 * without an environmental sensor or AI accelerator attached.
 */
export interface SystemInfo {
  /** Pi SoC temperature (°C). */
  cpu_temp_c: number
  /** Pi CPU utilisation, 0–100. */
  cpu_usage_pct: number

  /** RAM utilisation, 0–100. */
  mem_usage_pct: number
  mem_used_mb: number
  mem_total_mb: number

  /** AI HAT+ (Hailo-8L) — false when the accelerator isn't detected. */
  hailo_present: boolean
  hailo_temp_c: number | null
  /** NPU utilisation, 0–100. */
  hailo_usage_pct: number | null

  /** Environmental sensor — null when none is attached. */
  ambient_temp_c: number | null
  humidity_pct: number | null
}

/* ────────────────────────────────────────────────────────────
 * Tooling — Stepper motor control (Pi → Arduino CNC Shield + A4988)
 * ──────────────────────────────────────────────────────────── */

export type StepperAxis = 'x' | 'y' | 'z'
export type StepperDirection = 'cw' | 'ccw'

export interface StepperMotorStatus {
  connected: boolean
  axis: StepperAxis
  /** Current logical position in full/micro steps, as reported by server.py. */
  position_steps: number
  /** Multi-axis logical position. Newer motor endpoints should prefer this. */
  positions?: Record<StepperAxis, number>
  moving: boolean
  last_command: string | null
  updated_at: string
  error?: string
}

export interface StepperMoveRequest {
  axis: StepperAxis
  direction: StepperDirection
  /** Positive integer step count. The Arduino firmware handles microstepping. */
  steps: number
  /** Steps per second. Keep this conservative for A4988 thermal headroom. */
  speed_sps: number
}

export interface StepperHomeRequest {
  axis: StepperAxis
  speed_sps: number
}

export interface StepperTeachPoint {
  id: string
  name: string
  positions: Record<StepperAxis, number>
  speed_sps: number
  /** Pause after reaching this point. */
  dwell_ms: number
}

export interface StepperSequenceRequest {
  name: string
  points: StepperTeachPoint[]
  repeat: number
}

/* ────────────────────────────────────────────────────────────
 * Tooling — System Diagnostics + Event Logs
 * ──────────────────────────────────────────────────────────── */

export type DiagnosticState = 'ok' | 'warn' | 'error' | 'unknown'

export interface DiagnosticCheck {
  id: string
  label: string
  state: DiagnosticState
  detail: string
  updated_at: string
  latency_ms?: number | null
}

export interface SystemDiagnostics {
  summary: {
    state: DiagnosticState
    ok: number
    warn: number
    error: number
    unknown: number
    updated_at: string
  }
  checks: DiagnosticCheck[]
}

export type EventLogLevel = 'info' | 'warn' | 'error'
export type EventLogCategory = 'system' | 'auth' | 'mask' | 'motor' | 'tracking' | 'api'

export interface EventLogEntry {
  id: string
  t: string
  level: EventLogLevel
  category: EventLogCategory
  message: string
  detail?: string
}

/* ────────────────────────────────────────────────────────────
 * Tooling — Automation Rules + Calibration
 * ──────────────────────────────────────────────────────────── */

export type AutomationTrigger = 'no_mask' | 'improper_mask'

export interface AutomationRule {
  enabled: boolean
  cooldown_sec: number
  play_motor_sequence: boolean
  sequence_name: string
  trigger_tts: boolean
  tts_message: string
  skip_if_motor_busy: boolean
}

export interface ApplyStatus {
  ok: boolean
  message: string
  detail?: string
  applied_at: string
}

export interface AutomationRulesConfig {
  enabled: boolean
  updated_at: string
  rules: Record<AutomationTrigger, AutomationRule>
  apply_status?: ApplyStatus
}

export interface DetectionRoi {
  x_pct: number
  y_pct: number
  w_pct: number
  h_pct: number
}

export interface CalibrationConfig {
  detection_confidence: number
  mask_confidence: number
  tracker_match_threshold: number
  roi: DetectionRoi
  updated_at: string
  apply_status?: ApplyStatus
}

/* ────────────────────────────────────────────────────────────
 * Tooling — Tracking Tuner (ByteTrack config on the Pi)
 * ──────────────────────────────────────────────────────────── */

/**
 * ByteTrack tracker tuning knobs, adjustable from Tools → Tracking Tuner.
 *
 * Field names, defaults, and ranges are CONFIRMED against the real tracker
 * config on the Pi (verified when /api/tracking/config was implemented).
 *
 * ⚠️ Exception: `process_noise_pos` / `process_noise_vel` are accepted and
 * echoed by the Pi but the tracker does not act on them yet — the Pi returns
 * `apply_status.pending = true` for them. They are flagged `pending` in the
 * specs below so the UI badges them as "adjustable but not yet effective".
 * See docs/pi-tracking-config-endpoint.md.
 */
export interface ByteTrackConfig {
  /** Detection confidence to start/continue a track directly (high-confidence pass). */
  track_high_thresh: number
  /** Lowest confidence still used in ByteTrack's second association pass. */
  track_low_thresh: number
  /** Minimum confidence to spawn a brand-new track from an unmatched detection. */
  new_track_thresh: number
  /** IoU threshold used to match detections to existing tracks (0–1). */
  match_thresh: number
  /** Weight given to appearance/re-ID similarity when breaking match ties (0–1). */
  appearance_weight: number
  /** Extra matching-cost weight from how far the box centres are apart (0–1). */
  center_distance_weight: number
  /** Frames a lost track is kept before deletion (unit: FRAMES, not seconds). */
  track_buffer: number
  /** Consecutive hits required before a track is confirmed as a real person. */
  min_hits_to_confirm: number
  /** Frame rate (fps) the tracker computes with; should match the real pipeline. */
  frame_rate: number
  /** Kalman process noise for POSITION — tolerance for a box jumping far per frame.
   *  ⚠️ Accepted by the Pi but not yet effective on the tracker (apply_status.pending). */
  process_noise_pos: number
  /** Kalman process noise for VELOCITY — tolerance for speed changes per frame.
   *  ⚠️ Accepted by the Pi but not yet effective on the tracker (apply_status.pending). */
  process_noise_vel: number
}

/**
 * Confirmed defaults + slider ranges for each ByteTrackConfig field — the single
 * source both the mock/real clients (clamping) and the Tracking Tuner page
 * (rendering the form) read from, so the two can't drift apart.
 *
 * `pending: true` marks a knob the Pi accepts but doesn't act on yet, so the UI
 * can badge it. `int: true` marks whole-number knobs (frames/counts/fps).
 */
export const BYTETRACK_PARAM_SPECS: ReadonlyArray<{
  key: keyof ByteTrackConfig
  label: string
  description: string
  min: number
  max: number
  step: number
  default: number
  /** Whole-number knob (frames / counts / fps). */
  int?: boolean
  /** Accepted by the Pi but not yet effective on the tracker — badge it in the UI. */
  pending?: boolean
}> = [
  {
    key: 'track_high_thresh',
    label: 'Track High Threshold',
    description:
      'confidence ขั้นต่ำที่ถือว่าเป็น detection "มั่นใจสูง" ใช้เริ่ม/ต่อ track โดยตรง — สูงขึ้น = รับเฉพาะกล่องที่มั่นใจมาก',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.5
  },
  {
    key: 'track_low_thresh',
    label: 'Track Low Threshold',
    description:
      'confidence ต่ำสุดที่ยังเอามาช่วยจับคู่ track เดิมในรอบสองของ ByteTrack — ต่ำลง = เก็บกล่องจาง ๆ ไว้กันหลุด track',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.1
  },
  {
    key: 'new_track_thresh',
    label: 'New Track Threshold',
    description:
      'confidence ขั้นต่ำสำหรับ "สร้าง track ใหม่" จาก detection ที่ยังไม่จับคู่ใคร — สูงขึ้น = สร้าง track ใหม่ยากขึ้น (ผี/noise น้อยลง)',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.6
  },
  {
    key: 'match_thresh',
    label: 'Match Threshold',
    description:
      'ค่า IoU ขั้นต่ำสำหรับจับคู่ detection เข้ากับ track เดิม — สูงขึ้น = เข้มงวดขึ้น (จับคู่ผิดน้อยลง แต่หลุด track ง่ายขึ้น)',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.8
  },
  {
    key: 'appearance_weight',
    label: 'Appearance Weight',
    description:
      'น้ำหนักของลักษณะรูปลักษณ์ (re-ID) ตอนตัดสินใจกรณี IoU ก้ำกึ่ง — สูงขึ้น = พึ่งพาหน้าตามากกว่าตำแหน่ง (0 = ปิด ไม่ใช้ appearance)',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.0
  },
  {
    key: 'center_distance_weight',
    label: 'Center Distance Weight',
    description:
      'น้ำหนัก cost เสริมจากระยะห่างของจุดกึ่งกลางกรอบ ตอนจับคู่ detection กับ track — สูงขึ้น = ให้ความสำคัญกับระยะห่างจุดศูนย์กลางมากขึ้น (0 = ปิด)',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.0
  },
  {
    key: 'track_buffer',
    label: 'Track Buffer',
    description:
      'จำนวนเฟรมที่ยังเก็บ track ที่หายไปไว้ก่อนลบทิ้ง (หน่วยเป็น "เฟรม" ไม่ใช่วินาที) — มากขึ้น = ทน occlusion/คนบังกันได้นานขึ้น',
    min: 1,
    max: 300,
    step: 1,
    default: 30,
    int: true
  },
  {
    key: 'min_hits_to_confirm',
    label: 'Min Hits to Confirm',
    description:
      'จำนวนครั้งที่ต้องเจอ track ติดกันก่อน "ยืนยัน" ว่าเป็นคนจริง — สูงขึ้น = ผีน้อยลง แต่ยืนยันช้าลง',
    min: 1,
    max: 30,
    step: 1,
    default: 3,
    int: true
  },
  {
    key: 'frame_rate',
    label: 'Frame Rate',
    description:
      'เฟรมเรตที่ tracker ใช้คำนวณ (fps) — ควรตั้งให้ตรงกับกล้อง/pipeline จริง (reCamera ~10fps)',
    min: 1,
    max: 60,
    step: 1,
    default: 10,
    int: true
  },
  {
    key: 'process_noise_pos',
    label: 'Process Noise (Position)',
    description:
      'Kalman filter: ความยอมรับให้กรอบขยับตำแหน่งไกลต่อเฟรม — สูงขึ้น = ยอมรับการกระโดดของตำแหน่งมากขึ้น',
    min: 0,
    max: 0.5,
    step: 0.001,
    default: 0.05,
    pending: true
  },
  {
    key: 'process_noise_vel',
    label: 'Process Noise (Velocity)',
    description:
      'Kalman filter: ความยอมรับให้ความเร็วเปลี่ยนต่อเฟรม — สูงขึ้น = ยอมรับการเปลี่ยนความเร็วมากขึ้น',
    min: 0,
    max: 0.1,
    step: 0.00025,
    default: 0.00625,
    pending: true
  }
]

/* ────────────────────────────────────────────────────────────
 * Tooling — SSH terminal (interactive shell on the Pi)
 * ──────────────────────────────────────────────────────────── */

/**
 * Credentials for opening an interactive SSH shell on the Pi.
 *
 * ⚠️ `password` crosses IPC once at connect time and is used only to establish
 * the ssh2 session in the main process — it is never persisted by the terminal
 * layer itself. The renderer decides whether to remember it (safeStorage).
 */
export interface TerminalConnectRequest {
  host: string
  port: number
  username: string
  password: string
}

/** Result of TerminalConnectRequest — a sessionId keys all later I/O. */
export type TerminalOpenResult =
  | { ok: true; sessionId: string }
  | { ok: false; error: string }

/** main → renderer: a chunk of shell output for a given session. */
export interface TerminalDataEvent {
  sessionId: string
  data: string
}

/** main → renderer: the shell/connection for a session has ended. */
export interface TerminalExitEvent {
  sessionId: string
  reason: string
}

/* ────────────────────────────────────────────────────────────
 * Layer 3 — Cache (last-known session snapshot)
 * ──────────────────────────────────────────────────────────── */

export interface CachedSnapshot {
  status: SystemStatus
  /** True when served from cache because the live source was unavailable. */
  stale: boolean
  /** ISO timestamp the snapshot was cached. */
  cachedAt: string
}

/* ────────────────────────────────────────────────────────────
 * Auth & user management (server.py /api/auth + /api/admin)
 * ──────────────────────────────────────────────────────────── */

export type Role = 'pending' | 'user' | 'admin'

/** A user row as returned by GET /api/admin/users. */
export interface UserRecord {
  id: number
  username: string
  role: Role
  created_at: string
}

/**
 * What the renderer is allowed to know about the current session.
 * The raw JWT never crosses into the renderer — it stays in the main process
 * (encrypted via safeStorage) and is attached to admin requests there.
 */
export interface AuthSession {
  username: string
  /** Display name — captured at signup, editable in Settings. May be empty. */
  firstName: string
  lastName: string
  role: Role
  /** ISO timestamp when the token expires. */
  expiresAt: string
}

export type SignupResult = { ok: true; role: Role } | { ok: false; reason: string }

export type LoginResult = { ok: true; session: AuthSession } | { ok: false; reason: string }

/* ────────────────────────────────────────────────────────────
 * IPC event channel names (single source of truth)
 * ──────────────────────────────────────────────────────────── */

export const IPC = {
  connection: {
    getStatus: 'connection:getStatus',
    connect: 'connection:connect',
    disconnect: 'connection:disconnect',
    /** main → renderer push when the connection status changes */
    onStatus: 'connection:onStatus'
  },
  api: {
    getStatus: 'api:getStatus',
    getMaskStats: 'api:getMaskStats',
    getSystemInfo: 'api:getSystemInfo',
    getPmHistory: 'api:getPmHistory',
    getMaskHistory: 'api:getMaskHistory',
    getStepperStatus: 'api:getStepperStatus',
    moveStepper: 'api:moveStepper',
    stopStepper: 'api:stopStepper',
    homeStepper: 'api:homeStepper',
    saveStepperTeachPoint: 'api:saveStepperTeachPoint',
    playStepperSequence: 'api:playStepperSequence',
    getDiagnostics: 'api:getDiagnostics',
    getEventLogs: 'api:getEventLogs',
    getAutomationRules: 'api:getAutomationRules',
    applyAutomationRules: 'api:applyAutomationRules',
    resetAutomationRules: 'api:resetAutomationRules',
    getCalibration: 'api:getCalibration',
    applyCalibration: 'api:applyCalibration',
    resetCalibration: 'api:resetCalibration'
  },
  cache: {
    getLast: 'cache:getLast'
  },
  config: {
    getDashboardUrl: 'config:getDashboardUrl'
  },
  tracking: {
    getConfig: 'tracking:getConfig',
    applyConfig: 'tracking:applyConfig',
    resetConfig: 'tracking:resetConfig'
  },
  terminal: {
    open: 'terminal:open',
    /** renderer → main: keystrokes to write into the shell */
    input: 'terminal:input',
    /** renderer → main: PTY resize (cols/rows) */
    resize: 'terminal:resize',
    close: 'terminal:close',
    /** main → renderer push: shell output */
    onData: 'terminal:onData',
    /** main → renderer push: shell/connection ended */
    onExit: 'terminal:onExit'
  },
  report: {
    exportPdf: 'report:exportPdf'
  },
  auth: {
    signup: 'auth:signup',
    login: 'auth:login',
    logout: 'auth:logout',
    getSession: 'auth:getSession'
  },
  avatar: {
    get: 'avatar:get',
    set: 'avatar:set',
    clear: 'avatar:clear'
  },
  admin: {
    listUsers: 'admin:listUsers',
    approve: 'admin:approve',
    promote: 'admin:promote',
    reject: 'admin:reject'
  }
} as const
