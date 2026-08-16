/**
 * Main-process configuration & feature flags.
 *
 * This is the ONE place to flip mock ↔ real for each layer. Nothing else in
 * the app should branch on "are we mocking?" — the factories in each layer
 * read these flags and hand back the right implementation.
 */
export const config = {
  /** Layer 1: false → use the real ESP32 serial dongle (once implemented). */
  useMockConnection: true,

  /**
   * Layer 2 master switch. true → EVERYTHING is mock (offline dev).
   * false → hit server.py over HTTP, EXCEPT the per-feature overrides below.
   */
  useMockApi: false,

  /**
   * Per-feature mock overrides — only apply when useMockApi is false.
   * Set a flag true to keep that feature on mock data because its hardware
   * isn't wired yet. Flip to false once the Pi/hardware is connected.
   * ⚠️ Keep docs/MOCK_STATUS.md in sync when you change these.
   */
  useMockPm: true, // PM2.5 sensor not connected → pm2.5 value + PM history stay mock
  useMockMotor: true, // Arduino/CNC not connected → stepper stays mock
  useMockDiagnostics: false, // Pi /api/diagnostics is merged
  useMockEventLogs: false, // Pi /api/event-logs is merged
  useMockAutomation: false, // Pi /api/automation/rules is merged
  useMockCalibration: false, // Pi /api/calibration is merged; vision runtime binding still pending

  /**
   * Tracking Tuner (ByteTrackConfig). Independent of useMockApi — this is its
   * own layer (src/main/layers/tracking), not part of Layer 2's ApiClient.
   * false → hit /api/tracking/config on the Pi (implemented + verified; 11-field
   * contract). process_noise_pos/vel are accepted but not yet effective on the
   * tracker. See docs/pi-tracking-config-endpoint.md.
   */
  useMockTracking: false,

  /** Auth: false → use server.py /api/auth + /api/admin at piBaseUrl. */
  useMockAuth: false,

  /**
   * Base URL of server.py on the Pi. Used whenever useMockApi or useMockAuth
   * is false. Hardcoded for now; later this comes from the dongle handshake.
   */
  piBaseUrl: 'http://192.168.1.39:8000',

  /**
   * URL of the live dashboard the Live viewer page embeds via <webview>.
   * Hardcoded for early testing that embedding works end-to-end.
   */
  dashboardUrl: 'http://192.168.1.39:8000/dashboard'
} as const

export type AppConfig = typeof config
