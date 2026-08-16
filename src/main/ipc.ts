import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import { writeFile, rm } from 'fs/promises'
import { join } from 'path'
import {
  IPC,
  type AuthSession,
  type LoginResult,
  type SignupResult,
  type StepperMoveRequest,
  type StepperHomeRequest,
  type StepperTeachPoint,
  type StepperSequenceRequest,
  type TerminalConnectRequest,
  type ByteTrackConfig,
  type AutomationRulesConfig,
  type CalibrationConfig
} from '@shared/types'
import { config } from './config'
import { createConnectionProvider, type ConnectionProvider } from './layers/connection'
import { createApiClient, type ApiClient } from './layers/api'
import { createSessionCache, type SessionCacheStore } from './layers/cache'
import { createAuthClient, type AuthClient } from './layers/auth'
import { createTrackingConfigClient, type TrackingConfigClient } from './layers/tracking'
import { tokenStore, tokenExpiry, type StoredSession } from './services/tokenStore'
import { avatarStore } from './services/avatarStore'
import { createSshTerminalManager } from './services/sshTerminal'

/**
 * Wires the 3 backend layers to the renderer over IPC.
 *
 * Instantiates each layer via its factory (mock/real chosen in config.ts),
 * registers request/response handlers, and pushes connection-status changes
 * to the renderer. Returns a disposer to call on quit.
 */
export function registerIpc(getWindow: () => BrowserWindow | null): () => void {
  const connection: ConnectionProvider = createConnectionProvider()
  const api: ApiClient = createApiClient()
  const cache: SessionCacheStore = createSessionCache()
  const auth: AuthClient = createAuthClient()
  const tracking: TrackingConfigClient = createTrackingConfigClient()

  // Interactive SSH shells on the Pi. Output/exit are pushed to the renderer.
  const terminals = createSshTerminalManager({
    onData: (sessionId, data) =>
      getWindow()?.webContents.send(IPC.terminal.onData, { sessionId, data }),
    onExit: (sessionId, reason) =>
      getWindow()?.webContents.send(IPC.terminal.onExit, { sessionId, reason })
  })

  /** Load the stored session, or throw if nobody is signed in. */
  const requireSession = (): StoredSession => {
    const session = tokenStore.load()
    if (!session) throw new Error('ยังไม่ได้เข้าสู่ระบบ')
    return session
  }

  /** Load the stored session and require it to be an admin, or throw. */
  const requireAdminToken = (): StoredSession => {
    const session = tokenStore.load()
    if (!session || session.role !== 'admin') {
      throw new Error('ต้องเป็นผู้ดูแลระบบ')
    }
    return session
  }

  const toSession = (s: StoredSession): AuthSession => ({
    username: s.username,
    firstName: s.firstName,
    lastName: s.lastName,
    role: s.role,
    expiresAt: s.expiresAt
  })

  // ── Layer 1: connection ──────────────────────────────────────
  ipcMain.handle(IPC.connection.getStatus, () => connection.getStatus())
  ipcMain.handle(IPC.connection.connect, () => connection.connect())
  ipcMain.handle(IPC.connection.disconnect, () => connection.disconnect())

  // push status changes to the renderer
  const unsubscribe = connection.onStatusChange((status) => {
    getWindow()?.webContents.send(IPC.connection.onStatus, status)
  })

  // ── Layer 2: api (writes through to Layer 3 cache) ───────────
  ipcMain.handle(IPC.api.getStatus, async () => {
    const status = await api.getStatus()
    cache.put(status)
    return status
  })

  ipcMain.handle(IPC.api.getMaskStats, (_e, hours: number) => api.getMaskStats(hours))

  ipcMain.handle(IPC.api.getSystemInfo, () => api.getSystemInfo())

  ipcMain.handle(IPC.api.getPmHistory, (_e, hours: number) => api.getPmHistory(hours))

  ipcMain.handle(IPC.api.getMaskHistory, (_e, hours: number) => api.getMaskHistory(hours))

  ipcMain.handle(IPC.api.getStepperStatus, () => api.getStepperStatus())

  ipcMain.handle(IPC.api.moveStepper, (_e, request: StepperMoveRequest) =>
    api.moveStepper(request)
  )

  ipcMain.handle(IPC.api.stopStepper, () => api.stopStepper())

  ipcMain.handle(IPC.api.homeStepper, (_e, request: StepperHomeRequest) =>
    api.homeStepper(request)
  )

  ipcMain.handle(IPC.api.saveStepperTeachPoint, (_e, point: StepperTeachPoint) =>
    api.saveStepperTeachPoint(point)
  )

  ipcMain.handle(IPC.api.playStepperSequence, (_e, request: StepperSequenceRequest) =>
    api.playStepperSequence(request)
  )

  ipcMain.handle(IPC.api.getDiagnostics, () => api.getDiagnostics())

  ipcMain.handle(IPC.api.getEventLogs, (_e, limit: number) => api.getEventLogs(limit))

  ipcMain.handle(IPC.api.getAutomationRules, () => api.getAutomationRules())
  ipcMain.handle(IPC.api.applyAutomationRules, (_e, next: AutomationRulesConfig) =>
    api.applyAutomationRules(next)
  )
  ipcMain.handle(IPC.api.resetAutomationRules, () => api.resetAutomationRules())

  ipcMain.handle(IPC.api.getCalibration, () => api.getCalibration())
  ipcMain.handle(IPC.api.applyCalibration, (_e, next: CalibrationConfig) =>
    api.applyCalibration(next)
  )
  ipcMain.handle(IPC.api.resetCalibration, () => api.resetCalibration())

  // ── Layer 3: cache ───────────────────────────────────────────
  ipcMain.handle(IPC.cache.getLast, () => cache.getLast())

  // ── Config passthrough ───────────────────────────────────────
  ipcMain.handle(IPC.config.getDashboardUrl, () => config.dashboardUrl)

  // ── Tracking Tuner (ByteTrack config; mock until the Pi endpoint exists) ──
  ipcMain.handle(IPC.tracking.getConfig, () => tracking.getConfig())
  ipcMain.handle(IPC.tracking.applyConfig, (_e, next: ByteTrackConfig) =>
    tracking.applyConfig(next)
  )
  ipcMain.handle(IPC.tracking.resetConfig, () => tracking.resetConfig())

  // ── SSH terminal (admin-only tool; the Pi's own SSH auth is the real gate) ──
  ipcMain.handle(IPC.terminal.open, (_e, req: TerminalConnectRequest) => {
    requireAdminToken()
    return terminals.open(req)
  })
  ipcMain.on(IPC.terminal.input, (_e, sessionId: string, data: string) =>
    terminals.input(sessionId, data)
  )
  ipcMain.on(IPC.terminal.resize, (_e, sessionId: string, cols: number, rows: number) =>
    terminals.resize(sessionId, cols, rows)
  )
  ipcMain.handle(IPC.terminal.close, (_e, sessionId: string) => terminals.close(sessionId))

  // ── Report → PDF ─────────────────────────────────────────────
  // The renderer hands over a fully-formed HTML document; we render it in a
  // hidden window and print it to PDF (Thai text + exact layout via HTML/CSS).
  ipcMain.handle(
    IPC.report.exportPdf,
    async (
      _e,
      html: string,
      defaultName: string
    ): Promise<{ ok: boolean; filePath?: string; canceled?: boolean; error?: string }> => {
      const parent = getWindow()
      const result = await dialog.showSaveDialog(parent ?? undefined!, {
        title: 'บันทึกรายงาน PDF',
        defaultPath: defaultName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
      if (result.canceled || !result.filePath) return { ok: false, canceled: true }

      const tmpHtml = join(app.getPath('temp'), `aeris-report-${Date.now()}.html`)
      const printWin = new BrowserWindow({
        show: false,
        webPreferences: { sandbox: true }
      })
      try {
        await writeFile(tmpHtml, html, 'utf-8')
        await printWin.loadFile(tmpHtml)
        // let fonts + layout settle before printing
        await new Promise((r) => setTimeout(r, 150))
        const pdf = await printWin.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          margins: { top: 0, bottom: 0, left: 0, right: 0 }
        })
        await writeFile(result.filePath, pdf)
        return { ok: true, filePath: result.filePath }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      } finally {
        printWin.destroy()
        void rm(tmpHtml, { force: true }).catch(() => {})
      }
    }
  )

  // ── Auth ─────────────────────────────────────────────────────
  // The raw JWT stays in the main process (encrypted at rest via safeStorage);
  // the renderer only ever receives role/username/expiry.
  ipcMain.handle(
    IPC.auth.signup,
    (
      _e,
      username: string,
      password: string,
      firstName: string,
      lastName: string
    ): Promise<SignupResult> => auth.signup(username, password, firstName, lastName)
  )

  ipcMain.handle(
    IPC.auth.login,
    async (_e, username: string, password: string): Promise<LoginResult> => {
      const outcome = await auth.login(username, password)
      if (!outcome.ok) return { ok: false, reason: outcome.reason }
      const stored: StoredSession = {
        token: outcome.token,
        username: outcome.username,
        firstName: outcome.firstName,
        lastName: outcome.lastName,
        role: outcome.role,
        expiresAt: tokenExpiry(outcome.token)
      }
      tokenStore.save(stored)
      return { ok: true, session: toSession(stored) }
    }
  )

  ipcMain.handle(IPC.auth.logout, () => tokenStore.clear())

  ipcMain.handle(IPC.auth.getSession, (): AuthSession | null => {
    const s = tokenStore.load()
    return s ? toSession(s) : null
  })

  // ── Profile picture (local, keyed by the signed-in user) ────
  ipcMain.handle(IPC.avatar.get, () => avatarStore.get(requireSession().username))
  ipcMain.handle(IPC.avatar.set, (_e, dataUrl: string) =>
    avatarStore.set(requireSession().username, dataUrl)
  )
  ipcMain.handle(IPC.avatar.clear, () => avatarStore.clear(requireSession().username))

  // ── Admin (token pulled from the store, re-checked for admin role) ──
  ipcMain.handle(IPC.admin.listUsers, () => auth.listUsers(requireAdminToken().token))
  ipcMain.handle(IPC.admin.approve, (_e, id: number) =>
    auth.approve(requireAdminToken().token, id)
  )
  ipcMain.handle(IPC.admin.promote, (_e, id: number) =>
    auth.promote(requireAdminToken().token, id)
  )
  ipcMain.handle(IPC.admin.reject, (_e, id: number) =>
    auth.reject(requireAdminToken().token, id)
  )

  // Auto-connect the (mock) dongle on startup so the UI shows a live status.
  void connection.connect()

  return () => {
    unsubscribe()
    connection.dispose()
    terminals.disposeAll()
    ipcMain.removeHandler(IPC.connection.getStatus)
    ipcMain.removeHandler(IPC.connection.connect)
    ipcMain.removeHandler(IPC.connection.disconnect)
    ipcMain.removeHandler(IPC.api.getStatus)
    ipcMain.removeHandler(IPC.api.getMaskStats)
    ipcMain.removeHandler(IPC.api.getSystemInfo)
    ipcMain.removeHandler(IPC.api.getPmHistory)
    ipcMain.removeHandler(IPC.api.getMaskHistory)
    ipcMain.removeHandler(IPC.api.getStepperStatus)
    ipcMain.removeHandler(IPC.api.moveStepper)
    ipcMain.removeHandler(IPC.api.stopStepper)
    ipcMain.removeHandler(IPC.api.homeStepper)
    ipcMain.removeHandler(IPC.api.saveStepperTeachPoint)
    ipcMain.removeHandler(IPC.api.playStepperSequence)
    ipcMain.removeHandler(IPC.api.getDiagnostics)
    ipcMain.removeHandler(IPC.api.getEventLogs)
    ipcMain.removeHandler(IPC.api.getAutomationRules)
    ipcMain.removeHandler(IPC.api.applyAutomationRules)
    ipcMain.removeHandler(IPC.api.resetAutomationRules)
    ipcMain.removeHandler(IPC.api.getCalibration)
    ipcMain.removeHandler(IPC.api.applyCalibration)
    ipcMain.removeHandler(IPC.api.resetCalibration)
    ipcMain.removeHandler(IPC.cache.getLast)
    ipcMain.removeHandler(IPC.config.getDashboardUrl)
    ipcMain.removeHandler(IPC.tracking.getConfig)
    ipcMain.removeHandler(IPC.tracking.applyConfig)
    ipcMain.removeHandler(IPC.tracking.resetConfig)
    ipcMain.removeHandler(IPC.terminal.open)
    ipcMain.removeHandler(IPC.terminal.close)
    ipcMain.removeAllListeners(IPC.terminal.input)
    ipcMain.removeAllListeners(IPC.terminal.resize)
    ipcMain.removeHandler(IPC.report.exportPdf)
    ipcMain.removeHandler(IPC.auth.signup)
    ipcMain.removeHandler(IPC.auth.login)
    ipcMain.removeHandler(IPC.auth.logout)
    ipcMain.removeHandler(IPC.auth.getSession)
    ipcMain.removeHandler(IPC.avatar.get)
    ipcMain.removeHandler(IPC.avatar.set)
    ipcMain.removeHandler(IPC.avatar.clear)
    ipcMain.removeHandler(IPC.admin.listUsers)
    ipcMain.removeHandler(IPC.admin.approve)
    ipcMain.removeHandler(IPC.admin.promote)
    ipcMain.removeHandler(IPC.admin.reject)
  }
}
