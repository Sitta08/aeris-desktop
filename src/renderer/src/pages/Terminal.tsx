import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { TerminalConnectRequest } from '@shared/types'
import '@xterm/xterm/css/xterm.css'
import './terminal.css'

type Status = 'idle' | 'connecting' | 'connected'

/** Non-secret connection fields remembered between sessions (never the password). */
const REMEMBER_KEY = 'aeris.terminal.conn'
const DEFAULT_PORT = 22

interface RememberedConn {
  host: string
  port: number
  username: string
}

/**
 * Terminal & CMD — a real interactive SSH shell on the Pi, drawn with xterm.
 *
 * The renderer only draws bytes and forwards keystrokes; ssh2 lives in the main
 * process (see services/sshTerminal.ts). Output/exit arrive as pushes keyed by
 * sessionId — we filter on the one we opened so stale sessions can't bleed in.
 */
export default function Terminal(): JSX.Element {
  const remembered = loadRemembered()
  const [host, setHost] = useState(remembered?.host ?? '192.168.1.39')
  const [port, setPort] = useState(remembered?.port ?? DEFAULT_PORT)
  const [username, setUsername] = useState(remembered?.username ?? 'aeris')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  const screenRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<string | null>(null)

  // Create the xterm once and keep it for the page's lifetime. Subscriptions are
  // wired here (before any connect) so the shell's first prompt is never missed.
  useEffect(() => {
    if (!screenRef.current) return

    const term = new XTerm({
      fontFamily: '"Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: {
        background: '#0d0d0d',
        foreground: '#e6e6e6',
        cursor: '#ff7a1a',
        cursorAccent: '#0d0d0d',
        selectionBackground: 'rgba(255, 122, 26, 0.35)'
      }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(screenRef.current)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    // Keystrokes → main → Pi shell.
    const dataDisposable = term.onData((data) => {
      const id = sessionIdRef.current
      if (id) window.aeris.terminal.input(id, data)
    })

    // Shell output (main → renderer), filtered to our session.
    const offData = window.aeris.terminal.onData((ev) => {
      if (ev.sessionId === sessionIdRef.current) term.write(ev.data)
    })
    const offExit = window.aeris.terminal.onExit((ev) => {
      if (ev.sessionId !== sessionIdRef.current) return
      term.writeln(`\r\n\x1b[38;5;208m— ${ev.reason} —\x1b[0m`)
      sessionIdRef.current = null
      setStatus('idle')
    })

    // Keep the PTY the same size as the drawn area.
    const observer = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* container not laid out yet */
      }
      const id = sessionIdRef.current
      if (id) window.aeris.terminal.resize(id, term.cols, term.rows)
    })
    observer.observe(screenRef.current)

    return () => {
      observer.disconnect()
      dataDisposable.dispose()
      offData()
      offExit()
      const id = sessionIdRef.current
      if (id) void window.aeris.terminal.close(id)
      sessionIdRef.current = null
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [])

  const connect = async (): Promise<void> => {
    const req: TerminalConnectRequest = {
      host: host.trim(),
      port: clampPort(port),
      username: username.trim(),
      password
    }
    if (!req.host || !req.username) {
      setError('กรอก Host และ Username ก่อน')
      return
    }

    setStatus('connecting')
    setError(null)
    try {
      const result = await window.aeris.terminal.open(req)
      if (!result.ok) {
        setError(result.error)
        setStatus('idle')
        return
      }
      sessionIdRef.current = result.sessionId
      saveRemembered({ host: req.host, port: req.port, username: req.username })
      setPassword('')
      setStatus('connected')

      const term = termRef.current
      const fit = fitRef.current
      if (term && fit) {
        fit.fit()
        window.aeris.terminal.resize(result.sessionId, term.cols, term.rows)
        term.focus()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('idle')
    }
  }

  const disconnect = (): void => {
    const id = sessionIdRef.current
    if (id) void window.aeris.terminal.close(id)
    sessionIdRef.current = null
    setStatus('idle')
    termRef.current?.writeln('\r\n\x1b[38;5;244m— ตัดการเชื่อมต่อแล้ว —\x1b[0m')
  }

  const busy = status === 'connecting'
  const online = status === 'connected'

  return (
    <div className="page">
      <div className="terminal">
        <header className="terminal__head">
          <div>
            <h1 className="terminal__title">Terminal &amp; CMD</h1>
            <div className="terminal__sub">SSH เข้าไปยัง Raspberry Pi โดยตรง</div>
          </div>
          <span className={`conn-pill ${online ? 'is-on' : 'is-off'}`}>
            <span className="conn-pill__dot" />
            {online ? `${username}@${host}` : 'ไม่ได้เชื่อมต่อ'}
          </span>
        </header>

        <form
          className="terminal__bar"
          onSubmit={(e) => {
            e.preventDefault()
            if (!online && !busy) void connect()
          }}
        >
          <label className="terminal__field terminal__field--host">
            <span>Host</span>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              disabled={online || busy}
              placeholder="192.168.1.39"
            />
          </label>
          <label className="terminal__field terminal__field--port">
            <span>Port</span>
            <input
              type="number"
              min={1}
              max={65535}
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              disabled={online || busy}
            />
          </label>
          <label className="terminal__field">
            <span>Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={online || busy}
              placeholder="aeris"
            />
          </label>
          <label className="terminal__field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={online || busy}
              autoComplete="off"
            />
          </label>

          {online ? (
            <button type="button" className="terminal__danger" onClick={disconnect}>
              Disconnect
            </button>
          ) : (
            <button type="submit" className="terminal__primary" disabled={busy}>
              {busy ? 'กำลังเชื่อมต่อ…' : 'Connect'}
            </button>
          )}
        </form>

        {error && <div className="terminal__error">SSH error: {error}</div>}

        <div className="terminal__screen-wrap">
          <div className="terminal__screen" ref={screenRef} />
          {!online && !busy && (
            <div className="terminal__overlay">
              กรอกข้อมูลด้านบนแล้วกด <b>Connect</b> เพื่อเปิด shell ของ Pi
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function clampPort(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PORT
  return Math.min(65535, Math.max(1, Math.round(value)))
}

function loadRemembered(): RememberedConn | null {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as RememberedConn
    if (typeof parsed.host !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

function saveRemembered(conn: RememberedConn): void {
  try {
    localStorage.setItem(REMEMBER_KEY, JSON.stringify(conn))
  } catch {
    /* storage unavailable — non-fatal */
  }
}
