import { useCallback, useEffect, useState } from 'react'
import type { SystemStatus, MaskStats, NodesStatus } from '@shared/types'
import './dashboard.css'

/**
 * Dashboard — live PM2.5 + mask-detection stats from server.py (Layer 2).
 *
 * Two DISTINCT data sources, kept clearly separated so they can't be confused:
 *   • /api/mask-stats?hours=N  → windowed compliance counts (the dropdown)
 *   • /api/status → state       → live running tallies for TODAY + pm25 + nodes
 */

const RANGES = [
  { label: '1 ชั่วโมง', hours: 1 },
  { label: '2 ชั่วโมง', hours: 2 },
  { label: '24 ชั่วโมง', hours: 24 }
] as const

const NODE_LABELS: Record<keyof NodesStatus, string> = {
  pm25_sensor: 'PM2.5 sensor',
  voice_tts: 'Voice TTS',
  data_logger: 'Data logger',
  external_data: 'External data'
}

const STATUS_POLL_MS = 5000

export default function Dashboard(): JSX.Element {
  const [hours, setHours] = useState<number>(2)
  const [stats, setStats] = useState<MaskStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState<string | null>(null)

  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)

  // /api/mask-stats — (re)fetch on mount and whenever the range changes.
  const loadStats = useCallback((h: number) => {
    setStatsLoading(true)
    setStatsError(null)
    window.aeris.api
      .getMaskStats(h)
      .then(setStats)
      .catch((e: unknown) => setStatsError(errMsg(e)))
      .finally(() => setStatsLoading(false))
  }, [])

  useEffect(() => {
    loadStats(hours)
  }, [hours, loadStats])

  // /api/status — poll for live pm25, today's tallies, and node status.
  useEffect(() => {
    let active = true
    const tick = (): void => {
      window.aeris.api
        .getStatus()
        .then((s) => {
          if (!active) return
          setStatus(s)
          setStatusError(null)
        })
        .catch((e: unknown) => active && setStatusError(errMsg(e)))
    }
    tick()
    const id = setInterval(tick, STATUS_POLL_MS)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [])

  const compliance =
    stats && stats.total_passes > 0
      ? Math.round((stats.mask_count / stats.total_passes) * 100)
      : null

  return (
    <div className="page">
      <div className="dash">
        <header className="dash__head">
          <h1 className="dash__title">Dashboard</h1>
          <label className="dash__range">
            <span>ช่วงเวลา</span>
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {RANGES.map((r) => (
                <option key={r.hours} value={r.hours}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </header>

        {/* ── Windowed mask-stats ── */}
        <section className="dash__section">
          <div className="dash__section-head">
            <h2>สถิติการใส่หน้ากาก · {hours} ชม.ล่าสุด</h2>
            <span className="dash__hint">/api/mask-stats?hours={hours}</span>
          </div>

          {statsError ? (
            <ErrorCard msg={statsError} />
          ) : (
            <div className="dash__grid">
              <Stat label="Total passes" value={fmt(stats?.total_passes)} loading={statsLoading} />
              <Stat label="ใส่หน้ากาก" value={fmt(stats?.mask_count)} accent loading={statsLoading} />
              <Stat label="ไม่ใส่" value={fmt(stats?.no_mask_count)} loading={statsLoading} />
              <Stat
                label="ใส่ไม่ถูกต้อง"
                value={fmt(stats?.improper_count)}
                loading={statsLoading}
              />
              <Stat
                label="Compliance"
                value={compliance == null ? '—' : `${compliance}%`}
                accent
                big
                loading={statsLoading}
              />
            </div>
          )}
        </section>

        {/* ── Live today: tallies + PM2.5 ── */}
        <section className="dash__section">
          <div className="dash__section-head">
            <h2>สด · วันนี้</h2>
            <span className="dash__hint">/api/status → state</span>
          </div>

          <div className="dash__grid dash__grid--wide">
            <div className="tile tile--tally">
              <div className="tile__label">สะสมวันนี้ (live tally)</div>
              <div className="tally">
                <div className="tally__col">
                  <span className="tally__num accent">{fmt(status?.state.mask_tally_on)}</span>
                  <span className="tally__cap">ใส่หน้ากาก</span>
                </div>
                <div className="tally__sep" />
                <div className="tally__col">
                  <span className="tally__num">{fmt(status?.state.mask_tally_off)}</span>
                  <span className="tally__cap">ไม่ใส่</span>
                </div>
              </div>
              <div className="tile__foot">
                คนละชุดกับสถิติช่วงเวลาด้านบน — นี่คือยอดสะสมสดของ “วันนี้”
              </div>
            </div>

            <div className="tile tile--pm">
              <div className="tile__label">PM2.5 ปัจจุบัน</div>
              <div className="pm">
                <span className="pm__num">{fmt(status?.state.pm25)}</span>
                <span className="pm__unit">µg/m³</span>
              </div>
              {status && (
                <div className={`pm__badge pm__badge--${pmLevel(status.state.pm25)}`}>
                  {pmLabel(status.state.pm25)}
                </div>
              )}
            </div>
          </div>

          {statusError && <ErrorCard msg={statusError} />}
        </section>

        {/* ── Node status strip ── */}
        <section className="dash__section">
          <div className="dash__section-head">
            <h2>สถานะโหนด</h2>
            <span className="dash__hint">/api/status → nodes_status</span>
          </div>

          {status ? (
            <div className="nodes">
              {(Object.keys(NODE_LABELS) as (keyof NodesStatus)[]).map((key) => {
                const up = status.nodes_status[key]
                return (
                  <div key={key} className={`node ${up ? 'is-up' : 'is-down'}`}>
                    <span className="node__dot" />
                    <span className="node__name">{NODE_LABELS[key]}</span>
                    <span className="node__state">{up ? 'online' : 'offline'}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="muted">กำลังโหลด…</div>
          )}
        </section>
      </div>
    </div>
  )
}

/* ── small presentational helpers ── */

function Stat(props: {
  label: string
  value: string
  accent?: boolean
  big?: boolean
  loading?: boolean
}): JSX.Element {
  return (
    <div className={`tile ${props.big ? 'tile--big' : ''}`}>
      <div className="tile__label">{props.label}</div>
      <div className={`tile__value ${props.accent ? 'accent' : ''}`}>
        {props.loading ? '…' : props.value}
      </div>
    </div>
  )
}

function ErrorCard({ msg }: { msg: string }): JSX.Element {
  return (
    <div className="tile tile--error">
      <div className="tile__label">โหลดข้อมูลไม่ได้</div>
      <div className="muted">{msg}</div>
    </div>
  )
}

function fmt(n: number | undefined): string {
  return n == null ? '—' : n.toLocaleString()
}

type PmLevel = 'good' | 'moderate' | 'unhealthy' | 'hazardous'

function pmLevel(pm: number): PmLevel {
  if (pm > 150) return 'hazardous'
  if (pm > 55) return 'unhealthy'
  if (pm > 25) return 'moderate'
  return 'good'
}

function pmLabel(pm: number): string {
  return { good: 'ดี', moderate: 'ปานกลาง', unhealthy: 'ไม่ดีต่อสุขภาพ', hazardous: 'อันตราย' }[
    pmLevel(pm)
  ]
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
