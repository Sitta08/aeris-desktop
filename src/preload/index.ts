import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type ConnectionStatus,
  type SystemStatus,
  type MaskStats,
  type SystemInfo,
  type PmSample,
  type MaskBucket,
  type CachedSnapshot,
  type AuthSession,
  type LoginResult,
  type SignupResult,
  type UserRecord,
  type StepperMotorStatus,
  type StepperMoveRequest,
  type StepperHomeRequest,
  type StepperTeachPoint,
  type StepperSequenceRequest,
  type TerminalConnectRequest,
  type TerminalOpenResult,
  type TerminalDataEvent,
  type TerminalExitEvent,
  type ByteTrackConfig,
  type SystemDiagnostics,
  type EventLogEntry,
  type AutomationRulesConfig,
  type CalibrationConfig
} from '@shared/types'

/**
 * The safe, typed surface the renderer sees as `window.aeris`.
 * Mirrors the 4-layer backend but exposes only intent, never Node internals.
 */
const aeris = {
  connection: {
    getStatus: (): Promise<ConnectionStatus> => ipcRenderer.invoke(IPC.connection.getStatus),
    connect: (): Promise<ConnectionStatus> => ipcRenderer.invoke(IPC.connection.connect),
    disconnect: (): Promise<void> => ipcRenderer.invoke(IPC.connection.disconnect),
    /** Subscribe to pushed status changes. Returns an unsubscribe fn. */
    onStatus: (cb: (status: ConnectionStatus) => void): (() => void) => {
      const handler = (_e: unknown, status: ConnectionStatus): void => cb(status)
      ipcRenderer.on(IPC.connection.onStatus, handler)
      return () => ipcRenderer.removeListener(IPC.connection.onStatus, handler)
    }
  },
  api: {
    getStatus: (): Promise<SystemStatus> => ipcRenderer.invoke(IPC.api.getStatus),
    getMaskStats: (hours: number): Promise<MaskStats> =>
      ipcRenderer.invoke(IPC.api.getMaskStats, hours),
    getSystemInfo: (): Promise<SystemInfo> => ipcRenderer.invoke(IPC.api.getSystemInfo),
    getPmHistory: (hours: number): Promise<PmSample[]> =>
      ipcRenderer.invoke(IPC.api.getPmHistory, hours),
    getMaskHistory: (hours: number): Promise<MaskBucket[]> =>
      ipcRenderer.invoke(IPC.api.getMaskHistory, hours),
    getStepperStatus: (): Promise<StepperMotorStatus> =>
      ipcRenderer.invoke(IPC.api.getStepperStatus),
    moveStepper: (request: StepperMoveRequest): Promise<StepperMotorStatus> =>
      ipcRenderer.invoke(IPC.api.moveStepper, request),
    stopStepper: (): Promise<StepperMotorStatus> => ipcRenderer.invoke(IPC.api.stopStepper),
    homeStepper: (request: StepperHomeRequest): Promise<StepperMotorStatus> =>
      ipcRenderer.invoke(IPC.api.homeStepper, request),
    saveStepperTeachPoint: (point: StepperTeachPoint): Promise<StepperTeachPoint> =>
      ipcRenderer.invoke(IPC.api.saveStepperTeachPoint, point),
    playStepperSequence: (request: StepperSequenceRequest): Promise<StepperMotorStatus> =>
      ipcRenderer.invoke(IPC.api.playStepperSequence, request),
    getDiagnostics: (): Promise<SystemDiagnostics> =>
      ipcRenderer.invoke(IPC.api.getDiagnostics),
    getEventLogs: (limit: number): Promise<EventLogEntry[]> =>
      ipcRenderer.invoke(IPC.api.getEventLogs, limit),
    getAutomationRules: (): Promise<AutomationRulesConfig> =>
      ipcRenderer.invoke(IPC.api.getAutomationRules),
    applyAutomationRules: (next: AutomationRulesConfig): Promise<AutomationRulesConfig> =>
      ipcRenderer.invoke(IPC.api.applyAutomationRules, next),
    resetAutomationRules: (): Promise<AutomationRulesConfig> =>
      ipcRenderer.invoke(IPC.api.resetAutomationRules),
    getCalibration: (): Promise<CalibrationConfig> =>
      ipcRenderer.invoke(IPC.api.getCalibration),
    applyCalibration: (next: CalibrationConfig): Promise<CalibrationConfig> =>
      ipcRenderer.invoke(IPC.api.applyCalibration, next),
    resetCalibration: (): Promise<CalibrationConfig> =>
      ipcRenderer.invoke(IPC.api.resetCalibration)
  },
  cache: {
    getLast: (): Promise<CachedSnapshot | null> => ipcRenderer.invoke(IPC.cache.getLast)
  },
  config: {
    getDashboardUrl: (): Promise<string> => ipcRenderer.invoke(IPC.config.getDashboardUrl)
  },
  tracking: {
    getConfig: (): Promise<ByteTrackConfig> => ipcRenderer.invoke(IPC.tracking.getConfig),
    applyConfig: (next: ByteTrackConfig): Promise<ByteTrackConfig> =>
      ipcRenderer.invoke(IPC.tracking.applyConfig, next),
    resetConfig: (): Promise<ByteTrackConfig> => ipcRenderer.invoke(IPC.tracking.resetConfig)
  },
  terminal: {
    open: (req: TerminalConnectRequest): Promise<TerminalOpenResult> =>
      ipcRenderer.invoke(IPC.terminal.open, req),
    input: (sessionId: string, data: string): void =>
      ipcRenderer.send(IPC.terminal.input, sessionId, data),
    resize: (sessionId: string, cols: number, rows: number): void =>
      ipcRenderer.send(IPC.terminal.resize, sessionId, cols, rows),
    close: (sessionId: string): Promise<void> => ipcRenderer.invoke(IPC.terminal.close, sessionId),
    /** Subscribe to shell output. Returns an unsubscribe fn. */
    onData: (cb: (ev: TerminalDataEvent) => void): (() => void) => {
      const handler = (_e: unknown, ev: TerminalDataEvent): void => cb(ev)
      ipcRenderer.on(IPC.terminal.onData, handler)
      return () => ipcRenderer.removeListener(IPC.terminal.onData, handler)
    },
    /** Subscribe to shell/connection end. Returns an unsubscribe fn. */
    onExit: (cb: (ev: TerminalExitEvent) => void): (() => void) => {
      const handler = (_e: unknown, ev: TerminalExitEvent): void => cb(ev)
      ipcRenderer.on(IPC.terminal.onExit, handler)
      return () => ipcRenderer.removeListener(IPC.terminal.onExit, handler)
    }
  },
  report: {
    exportPdf: (
      html: string,
      defaultName: string
    ): Promise<{ ok: boolean; filePath?: string; canceled?: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.report.exportPdf, html, defaultName)
  },
  auth: {
    signup: (
      username: string,
      password: string,
      firstName: string,
      lastName: string
    ): Promise<SignupResult> =>
      ipcRenderer.invoke(IPC.auth.signup, username, password, firstName, lastName),
    login: (username: string, password: string): Promise<LoginResult> =>
      ipcRenderer.invoke(IPC.auth.login, username, password),
    logout: (): Promise<void> => ipcRenderer.invoke(IPC.auth.logout),
    getSession: (): Promise<AuthSession | null> => ipcRenderer.invoke(IPC.auth.getSession)
  },
  avatar: {
    get: (): Promise<string | null> => ipcRenderer.invoke(IPC.avatar.get),
    set: (dataUrl: string): Promise<void> => ipcRenderer.invoke(IPC.avatar.set, dataUrl),
    clear: (): Promise<void> => ipcRenderer.invoke(IPC.avatar.clear)
  },
  admin: {
    listUsers: (): Promise<UserRecord[]> => ipcRenderer.invoke(IPC.admin.listUsers),
    approve: (id: number): Promise<void> => ipcRenderer.invoke(IPC.admin.approve, id),
    promote: (id: number): Promise<void> => ipcRenderer.invoke(IPC.admin.promote, id),
    reject: (id: number): Promise<void> => ipcRenderer.invoke(IPC.admin.reject, id)
  }
}

export type AerisApi = typeof aeris

contextBridge.exposeInMainWorld('aeris', aeris)
