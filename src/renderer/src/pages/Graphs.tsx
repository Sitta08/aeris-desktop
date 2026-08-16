import { useCallback, useEffect, useRef, useState } from 'react'
import type { MaskBucket, PmSample } from '@shared/types'
import { buildReportData, renderReportHtml } from '../report/report'
import { useAuth } from '../state/AuthProvider'
import './graphs.css'

/**
 * Graphs — historical trends, driven by one time-range dropdown.
 *
 *  • PM2.5 over time (line/area) + summary tiles — GET /api/pm-history.
 *  • Mask compliance % over time (line) + a stacked-bar window summary —
 *    GET /api/mask-history (bucketed counts).
 *
 * Both endpoints are mock for now. Chart internals share one LineChart.
 */

const RANGES = [
  { label: '1 ชั่วโมง', hours: 1 },
  { label: '6 ชั่วโมง', hours: 6 },
  { label: '24 ชั่วโมง', hours: 24 },
  { label: '7 วัน', hours: 168 },
  { label: '30 วัน', hours: 720 }
] as const

export default function Graphs(): JSX.Element {
  const [hours, setHours] = useState<number>(24)
  const [pm, setPm] = useState<PmSample[] | null>(null)
  const [mask, setMask] = useState<MaskBucket[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback((h: number) => {
    setLoading(true)
    setError(null)
    Promise.all([window.aeris.api.getPmHistory(h), window.aeris.api.getMaskHistory(h)])
      .then(([hist, buckets]) => {
        setPm(hist)
        setMask(buckets)
      })
      .catch((e: unknown) => setError(errMsg(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load(hours)
  }, [hours, load])

  const multiDay = hours >= 48

  // PM summary
  const pmVals = pm?.map((s) => s.pm25) ?? []
  const pmNow = pmVals.length ? pmVals[pmVals.length - 1] : null
  const pmAvg = pmVals.length ? Math.round(pmVals.reduce((a, b) => a + b, 0) / pmVals.length) : null
  const pmMin = pmVals.length ? Math.min(...pmVals) : null
  const pmMax = pmVals.length ? Math.max(...pmVals) : null

  // Mask window summary (sum of buckets) + compliance trend
  const totals = (mask ?? []).reduce(
    (a, b) => ({
      mask: a.mask + b.mask,
      no_mask: a.no_mask + b.no_mask,
      improper: a.improper + b.improper,
      total: a.total + b.total
    }),
    { mask: 0, no_mask: 0, improper: 0, total: 0 }
  )
  const compliancePts = (mask ?? []).map((b) => ({
    t: b.t,
    v: b.total > 0 ? Math.round((b.mask / b.total) * 100) : 0
  }))
  const complianceNow = totals.total > 0 ? Math.round((totals.mask / totals.total) * 100) : null

  const { session } = useAuth()
  const [exporting, setExporting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  // close the range menu on an outside click
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent): void => {
      if (!exportRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  // export the chosen range (fetches its own data, independent of the on-screen range)
  const exportRange = async (h: number): Promise<void> => {
    setMenuOpen(false)
    setExporting(true)
    setError(null)
    try {
      const [p, m] = await Promise.all([
        window.aeris.api.getPmHistory(h),
        window.aeris.api.getMaskHistory(h)
      ])
      const rangeLabel = RANGES.find((r) => r.hours === h)?.label ?? `${h}h`
      const author =
        [session?.firstName, session?.lastName].filter(Boolean).join(' ').trim() ||
        (session?.username ?? '')
      const html = renderReportHtml(buildReportData(p, m, rangeLabel, author))
      const stamp = new Date().toISOString().slice(0, 10)
      const res = await window.aeris.report.exportPdf(html, `aeris-report-${h}h-${stamp}.pdf`)
      if (!res.ok && !res.canceled) setError(res.error ?? 'สร้างรายงานไม่สำเร็จ')
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="page">
      <div className="graphs">
        <header className="graphs__head">
          <h1 className="graphs__title">Graphs</h1>
          <div className="graphs__actions">
            <div className="export-wrap" ref={exportRef}>
              <button
                type="button"
                className="graphs__export"
                onClick={() => setMenuOpen((v) => !v)}
                disabled={exporting}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <IconDownload />
                {exporting ? 'กำลังสร้างรายงาน…' : 'Export PDF'}
                {!exporting && <IconChevron />}
              </button>
              {menuOpen && (
                <div className="export-menu" role="menu">
                  <div className="export-menu__head">เลือกช่วงข้อมูล</div>
                  {RANGES.map((r) => (
                    <button
                      key={r.hours}
                      type="button"
                      role="menuitem"
                      className="export-menu__item"
                      onClick={() => exportRange(r.hours)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <label className="graphs__range">
              <span>ช่วงเวลา</span>
              <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                {RANGES.map((r) => (
                  <option key={r.hours} value={r.hours}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        <div className="graphs__body">
          {error && <div className="graphs__error">โหลดข้อมูลไม่ได้: {error}</div>}

          {/* PM2.5 over time */}
          <section className="card">
          <div className="card__head">
            <h2>PM2.5 ตามเวลา</h2>
            {pmNow != null && (
              <span className={`pm-now pm-now--${pmLevel(pmNow)}`}>
                {pmNow} µg/m³ · {pmLabel(pmNow)}
              </span>
            )}
          </div>

          {pm && pm.length > 1 ? (
            <LineChart
              points={pm.map((s) => ({ t: s.t, v: s.pm25 }))}
              yMax={niceCeil(Math.max(40, ...pmVals))}
              unit="µg/m³"
              color="accent"
              thresholds={[25, 55]}
              multiDay={multiDay}
            />
          ) : (
            <div className="card__empty">{loading ? 'กำลังโหลด…' : 'ไม่มีข้อมูล'}</div>
          )}

          <div className="stat-row">
            <Stat label="ปัจจุบัน" value={pmNow} accent />
            <Stat label="เฉลี่ย" value={pmAvg} />
            <Stat label="ต่ำสุด" value={pmMin} />
            <Stat label="สูงสุด" value={pmMax} />
          </div>
        </section>

        {/* Mask compliance over time */}
        <section className="card">
          <div className="card__head">
            <h2>การสวมหน้ากาก · แนวโน้ม</h2>
            {complianceNow != null && (
              <span className="compliance">
                {complianceNow}%<span className="compliance__cap">เฉลี่ยช่วงนี้</span>
              </span>
            )}
          </div>

          <div className="mask-row">
            <div className="mask-row__chart">
              {compliancePts.length > 1 ? (
                <LineChart
                  points={compliancePts}
                  yMax={100}
                  unit="%"
                  color="ok"
                  thresholds={[]}
                  multiDay={multiDay}
                />
              ) : (
                <div className="card__empty">{loading ? 'กำลังโหลด…' : 'ไม่มีข้อมูล'}</div>
              )}
            </div>

            {totals.total > 0 && (
              <MaskBar
                mask={totals.mask}
                improper={totals.improper}
                noMask={totals.no_mask}
                total={totals.total}
              />
            )}
          </div>
          </section>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────── reusable line / area chart ───────────────────── */

interface Pt {
  t: string
  v: number
}

const W = 760
const H = 240
const PAD = { l: 34, r: 12, t: 12, b: 22 }
const PLOT_W = W - PAD.l - PAD.r
const PLOT_H = H - PAD.t - PAD.b

function LineChart({
  points,
  yMax,
  unit,
  color,
  thresholds,
  multiDay
}: {
  points: Pt[]
  yMax: number
  unit: string
  color: 'accent' | 'ok'
  thresholds: number[]
  multiDay: boolean
}): JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const n = points.length
  const x = (i: number): number => PAD.l + (i / (n - 1)) * PLOT_W
  const y = (v: number): number => PAD.t + (1 - v / yMax) * PLOT_H

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`)
    .join(' ')
  const area = `${line} L${x(n - 1).toFixed(1)},${(PAD.t + PLOT_H).toFixed(1)} L${x(0).toFixed(1)},${(PAD.t + PLOT_H).toFixed(1)} Z`

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(yMax * f))
  const xTickIdx = pickTicks(n, 4)
  const guides = thresholds.filter((t) => t < yMax)

  const onMove = (e: React.MouseEvent): void => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const vbX = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round(((vbX - PAD.l) / PLOT_W) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, i)))
  }

  const hv = hover != null ? points[hover] : null

  return (
    <div className="g-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="g-svg"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="fill-accent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,122,26,0.34)" />
            <stop offset="100%" stopColor="rgba(255,122,26,0.02)" />
          </linearGradient>
          <linearGradient id="fill-ok" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(63,191,106,0.30)" />
            <stop offset="100%" stopColor="rgba(63,191,106,0.02)" />
          </linearGradient>
        </defs>

        {yTicks.map((v) => (
          <g key={v}>
            <line className="g-grid" x1={PAD.l} y1={y(v)} x2={W - PAD.r} y2={y(v)} />
            <text className="g-axis g-axis--y" x={PAD.l - 6} y={y(v)} dominantBaseline="middle">
              {v}
            </text>
          </g>
        ))}

        {guides.map((t) => (
          <g key={t}>
            <line className="g-th" x1={PAD.l} y1={y(t)} x2={W - PAD.r} y2={y(t)} />
            <text className="g-th-label" x={W - PAD.r} y={y(t) - 3} textAnchor="end">
              {t}
            </text>
          </g>
        ))}

        <path className="g-area" d={area} fill={`url(#fill-${color})`} />
        <path className={`g-line g-line--${color}`} d={line} />

        {xTickIdx.map((i) => (
          <text key={i} className="g-axis" x={x(i)} y={H - 6} textAnchor="middle">
            {fmtAxis(points[i].t, multiDay)}
          </text>
        ))}

        {hv && (
          <g pointerEvents="none">
            <line className="g-cross" x1={x(hover!)} y1={PAD.t} x2={x(hover!)} y2={PAD.t + PLOT_H} />
            <circle className={`g-dot g-dot--${color}`} cx={x(hover!)} cy={y(hv.v)} r="4" />
          </g>
        )}
      </svg>

      {hv && (
        <div
          className="g-tip"
          style={{ left: `${(x(hover!) / W) * 100}%`, top: `${(y(hv.v) / H) * 100}%` }}
        >
          <div className={`g-tip__val g-tip__val--${color}`}>
            {hv.v} <span>{unit}</span>
          </div>
          <div className="g-tip__time">{fmtFull(hv.t)}</div>
        </div>
      )}
    </div>
  )
}

/* ───────────────────────── mask composition bar ─────────────────────────── */

function MaskBar({
  mask,
  improper,
  noMask,
  total
}: {
  mask: number
  improper: number
  noMask: number
  total: number
}): JSX.Element {
  // top → bottom: best → worst (green → red)
  const segs = [
    { key: 'mask', label: 'ใส่หน้ากาก', count: mask, cls: 'ok' },
    { key: 'improper', label: 'ใส่ไม่ถูกต้อง', count: improper, cls: 'warn' },
    { key: 'nomask', label: 'ไม่ใส่', count: noMask, cls: 'err' }
  ]

  return (
    <aside className="mask-side">
      <div className="mask-side__head">
        <span className="mask__title">สรุปทั้งช่วง</span>
        <span className="mask__total">{total.toLocaleString()} ครั้ง</span>
      </div>

      <div className="mask-side__body">
        <div className="mask-vbar" role="img" aria-label="สัดส่วนการสวมหน้ากากทั้งช่วง">
          {segs.map(
            (s) =>
              s.count > 0 && (
                <div
                  key={s.key}
                  className={`mask-vseg mask-vseg--${s.cls}`}
                  style={{ flexGrow: s.count }}
                  title={`${s.label}: ${s.count} (${pct(s.count, total)}%)`}
                />
              )
          )}
        </div>

        <ul className="mask-legend">
          {segs.map((s) => (
            <li key={s.key} className="mask-litem">
              <span className={`mask__dot mask__dot--${s.cls}`} />
              <span className="mask-litem__text">
                <span className="mask-litem__label">{s.label}</span>
                <span className="mask-litem__val">
                  {s.count.toLocaleString()} · {pct(s.count, total)}%
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}

/* ───────────────────────── helpers ──────────────────────────────────────── */

function Stat({
  label,
  value,
  accent
}: {
  label: string
  value: number | null
  accent?: boolean
}): JSX.Element {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className={`stat__value ${accent ? 'accent' : ''}`}>
        {value == null ? '—' : value}
        {value != null && <span className="stat__unit">µg/m³</span>}
      </div>
    </div>
  )
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

function niceCeil(v: number): number {
  const step = v <= 50 ? 10 : v <= 100 ? 20 : v <= 200 ? 25 : 50
  return Math.ceil(v / step) * step
}

function pickTicks(n: number, count: number): number[] {
  if (n <= count) return Array.from({ length: n }, (_, i) => i)
  return Array.from({ length: count }, (_, k) => Math.round((k / (count - 1)) * (n - 1)))
}

/** Axis label: date for multi-day ranges, time for intraday. */
function fmtAxis(iso: string, multiDay: boolean): string {
  const d = new Date(iso)
  return multiDay
    ? d.toLocaleDateString([], { day: '2-digit', month: 'short' })
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** Tooltip label: always date + time. */
function fmtFull(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString([], { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function pct(part: number, total: number): number {
  return Math.round((part / total) * 100)
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function IconDownload(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  )
}

function IconChevron(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}
