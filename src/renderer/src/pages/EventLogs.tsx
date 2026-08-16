import { useEffect, useMemo, useState } from 'react'
import type { EventLogCategory, EventLogEntry, EventLogLevel } from '@shared/types'
import './event-logs.css'

const LIMIT = 100
const LEVELS: Array<EventLogLevel | 'all'> = ['all', 'info', 'warn', 'error']
const CATEGORIES: Array<EventLogCategory | 'all'> = [
  'all',
  'system',
  'auth',
  'mask',
  'motor',
  'tracking',
  'api'
]

export default function EventLogs(): JSX.Element {
  const [items, setItems] = useState<EventLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [level, setLevel] = useState<EventLogLevel | 'all'>('all')
  const [category, setCategory] = useState<EventLogCategory | 'all'>('all')

  const load = async (): Promise<void> => {
    setBusy(true)
    try {
      const next = await window.aeris.api.getEventLogs(LIMIT)
      setItems(next)
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        if (level !== 'all' && item.level !== level) return false
        if (category !== 'all' && item.category !== category) return false
        return true
      }),
    [category, items, level]
  )

  return (
    <div className="page">
      <div className="elog">
        <header className="elog__head">
          <div>
            <h1 className="elog__title">Event Logs</h1>
            <div className="elog__sub">system · auth · mask · motor · tracking · API</div>
          </div>
          <button type="button" className="elog__refresh" onClick={() => void load()} disabled={busy}>
            {busy ? 'Refreshing…' : 'Refresh'}
          </button>
        </header>

        <section className="elog__filters">
          <Segmented
            label="Level"
            value={level}
            options={LEVELS}
            onChange={(next) => setLevel(next as EventLogLevel | 'all')}
          />
          <Segmented
            label="Category"
            value={category}
            options={CATEGORIES}
            onChange={(next) => setCategory(next as EventLogCategory | 'all')}
          />
        </section>

        {error && <div className="elog__error">Event log API error: {error}</div>}

        <section className="elog__panel">
          <div className="elog__panel-head">
            <span>{filtered.length.toLocaleString()} events</span>
            <span>latest first</span>
          </div>

          {loading ? (
            <div className="elog__empty">กำลังโหลด event logs…</div>
          ) : filtered.length === 0 ? (
            <div className="elog__empty">ไม่มี log ที่ตรงกับ filter นี้</div>
          ) : (
            <ol className="elog-list">
              {filtered.map((item) => (
                <li className={`elog-row elog-row--${item.level}`} key={item.id}>
                  <div className="elog-row__time">
                    <span>{formatDate(item.t)}</span>
                    <strong>{formatTime(item.t)}</strong>
                  </div>
                  <div className="elog-row__main">
                    <div className="elog-row__line">
                      <span className={`elog-level elog-level--${item.level}`}>{item.level}</span>
                      <span className="elog-cat">{CATEGORY_LABEL[item.category]}</span>
                      <span className="elog-row__msg">{item.message}</span>
                    </div>
                    {item.detail && <p className="elog-row__detail">{item.detail}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}

function Segmented({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: string
  options: string[]
  onChange: (next: string) => void
}): JSX.Element {
  return (
    <div className="elog-seg">
      <span className="elog-seg__label">{label}</span>
      <div className="elog-seg__items" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            type="button"
            key={option}
            className={option === value ? 'is-active' : ''}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

const CATEGORY_LABEL: Record<EventLogCategory, string> = {
  system: 'System',
  auth: 'Auth',
  mask: 'Mask',
  motor: 'Motor',
  tracking: 'Tracking',
  api: 'API'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString()
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
