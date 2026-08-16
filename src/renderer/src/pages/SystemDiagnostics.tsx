import { useEffect, useMemo, useState } from 'react'
import type { DiagnosticState, SystemDiagnostics as SystemDiagnosticsData } from '@shared/types'
import './diagnostics.css'

const POLL_MS = 5000

export default function SystemDiagnostics(): JSX.Element {
  const [data, setData] = useState<SystemDiagnosticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (showBusy = true): Promise<void> => {
    if (showBusy) setBusy(true)
    try {
      const next = await window.aeris.api.getDiagnostics()
      setData(next)
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
      if (showBusy) setBusy(false)
    }
  }

  useEffect(() => {
    let active = true

    const tick = async (showBusy = false): Promise<void> => {
      try {
        const next = await window.aeris.api.getDiagnostics()
        if (!active) return
        setData(next)
        setError(null)
      } catch (e) {
        if (active) setError(errMsg(e))
      } finally {
        if (active) setLoading(false)
      }
    }

    void tick(true)
    const id = setInterval(() => void tick(false), POLL_MS)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [])

  const headline = useMemo(() => {
    if (!data) return 'กำลังตรวจระบบ'
    if (data.summary.error > 0) return 'ต้องตรวจสอบทันที'
    if (data.summary.warn > 0) return 'มีจุดที่ควรเช็ค'
    if (data.summary.unknown > 0) return 'มีสถานะที่ยังไม่ยืนยัน'
    return 'ระบบพร้อมใช้งาน'
  }, [data])

  return (
    <div className="page">
      <div className="diag">
        <header className="diag__head">
          <div>
            <h1 className="diag__title">System Diagnostics</h1>
            <div className="diag__sub">Pi services · hardware · data pipeline</div>
          </div>
          <button
            type="button"
            className="diag__refresh"
            onClick={() => void load(true)}
            disabled={busy}
          >
            {busy ? 'Refreshing…' : 'Refresh'}
          </button>
        </header>

        <section className={`diag-summary diag-summary--${data?.summary.state ?? 'unknown'}`}>
          <div>
            <div className="diag-summary__k">Overall Status</div>
            <div className="diag-summary__v">{headline}</div>
            <div className="diag-summary__t">
              อัปเดต: {data ? formatTime(data.summary.updated_at) : '—'}
            </div>
          </div>
          <div className="diag-summary__counts">
            <Count label="OK" value={data?.summary.ok ?? 0} state="ok" />
            <Count label="Warn" value={data?.summary.warn ?? 0} state="warn" />
            <Count label="Error" value={data?.summary.error ?? 0} state="error" />
            <Count label="Unknown" value={data?.summary.unknown ?? 0} state="unknown" />
          </div>
        </section>

        {error && <div className="diag__error">Diagnostics API error: {error}</div>}

        <section className="diag__grid">
          {loading && !data ? (
            <div className="diag__empty">กำลังโหลด diagnostics…</div>
          ) : (
            data?.checks.map((check) => (
              <article className={`diag-card diag-card--${check.state}`} key={check.id}>
                <div className="diag-card__head">
                  <span className={`state-dot state-dot--${check.state}`} />
                  <h2>{check.label}</h2>
                  <span className="diag-card__state">{STATE_LABEL[check.state]}</span>
                </div>
                <p className="diag-card__detail">{check.detail}</p>
                <div className="diag-card__meta">
                  <span>{formatTime(check.updated_at)}</span>
                  <span>{check.latency_ms == null ? 'latency —' : `${check.latency_ms} ms`}</span>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  )
}

function Count({
  label,
  value,
  state
}: {
  label: string
  value: number
  state: DiagnosticState
}): JSX.Element {
  return (
    <div className={`diag-count diag-count--${state}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

const STATE_LABEL: Record<DiagnosticState, string> = {
  ok: 'OK',
  warn: 'Warn',
  error: 'Error',
  unknown: 'Unknown'
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString()
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
