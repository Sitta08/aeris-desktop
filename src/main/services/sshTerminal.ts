/**
 * SSH terminal manager (main process).
 *
 * Opens interactive shell sessions on the Pi with `ssh2` and bridges them to
 * the renderer's xterm as a raw two-way byte stream. Lives in main — like the
 * HTTP layer — because it needs Node network/crypto access the renderer can't
 * have, and the JWT/credentials must never leak into the web context.
 *
 * Each session is keyed by an opaque `sessionId`; the renderer echoes it back
 * on every input/resize/close so multiple terminals could coexist. Output and
 * exit are pushed to the renderer via the injected event callbacks.
 */
import { Client, type ClientChannel } from 'ssh2'
import { randomUUID } from 'crypto'
import type {
  TerminalConnectRequest,
  TerminalOpenResult
} from '@shared/types'

/** How the manager reaches the renderer. Wired to webContents.send in ipc.ts. */
export interface TerminalEvents {
  onData: (sessionId: string, data: string) => void
  onExit: (sessionId: string, reason: string) => void
}

interface Session {
  client: Client
  stream: ClientChannel
}

export interface SshTerminalManager {
  open: (req: TerminalConnectRequest) => Promise<TerminalOpenResult>
  input: (sessionId: string, data: string) => void
  resize: (sessionId: string, cols: number, rows: number) => void
  close: (sessionId: string) => void
  disposeAll: () => void
}

export function createSshTerminalManager(events: TerminalEvents): SshTerminalManager {
  const sessions = new Map<string, Session>()

  function open(req: TerminalConnectRequest): Promise<TerminalOpenResult> {
    return new Promise((resolve) => {
      const client = new Client()
      const sessionId = randomUUID()
      // Guards against resolving twice (e.g. an 'error' after 'ready').
      let settled = false

      client.on('ready', () => {
        client.shell(
          { term: 'xterm-256color' },
          (err, stream) => {
            if (err) {
              settled = true
              client.end()
              resolve({ ok: false, error: err.message })
              return
            }

            sessions.set(sessionId, { client, stream })

            stream.on('data', (chunk: Buffer) =>
              events.onData(sessionId, chunk.toString('utf-8'))
            )
            stream.stderr?.on('data', (chunk: Buffer) =>
              events.onData(sessionId, chunk.toString('utf-8'))
            )
            stream.on('close', () => {
              sessions.delete(sessionId)
              client.end()
              events.onExit(sessionId, 'เซสชันปิดแล้ว')
            })

            settled = true
            resolve({ ok: true, sessionId })
          }
        )
      })

      client.on('error', (err: Error) => {
        if (!settled) {
          settled = true
          resolve({ ok: false, error: err.message })
        } else if (sessions.has(sessionId)) {
          sessions.delete(sessionId)
          events.onExit(sessionId, err.message)
        }
      })

      client.on('close', () => {
        if (sessions.has(sessionId)) {
          sessions.delete(sessionId)
          events.onExit(sessionId, 'การเชื่อมต่อถูกปิด')
        }
      })

      client.connect({
        host: req.host,
        port: req.port,
        username: req.username,
        password: req.password,
        readyTimeout: 15000,
        keepaliveInterval: 15000
      })
    })
  }

  function input(sessionId: string, data: string): void {
    sessions.get(sessionId)?.stream.write(data)
  }

  function resize(sessionId: string, cols: number, rows: number): void {
    // ssh2 signature is setWindow(rows, cols, height, width).
    sessions.get(sessionId)?.stream.setWindow(rows, cols, 0, 0)
  }

  function close(sessionId: string): void {
    const s = sessions.get(sessionId)
    if (!s) return
    sessions.delete(sessionId)
    try {
      s.stream.end()
      s.client.end()
    } catch {
      /* already torn down */
    }
  }

  function disposeAll(): void {
    for (const s of sessions.values()) {
      try {
        s.client.end()
      } catch {
        /* ignore */
      }
    }
    sessions.clear()
  }

  return { open, input, resize, close, disposeAll }
}
