import type { PmSample, MaskBucket } from '@shared/types'

/**
 * Builds the 2-page PDF report (as a self-contained HTML document that the
 * main process renders with printToPDF).
 *
 * Data is aggregated PER DAY from the same bucketed endpoints the Graphs page
 * uses (getPmHistory + getMaskHistory) — no separate endpoint.
 */

export interface DayRow {
  key: string
  label: string
  total: number
  mask: number
  no_mask: number
  improper: number
}

export interface ReportData {
  /** ผู้จัดทำ — synced from the signed-in account (empty → blank fill-in line). */
  author: string
  rangeLabel: string
  rangeStart: string
  rangeEnd: string
  generatedAt: string
  totalPasses: number
  maskRate: number
  pmAvg: number | null
  dayCount: number
  days: DayRow[]
}

const th = (iso: string): string =>
  new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })

const dayKey = (iso: string): string => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function buildReportData(
  pm: PmSample[],
  mask: MaskBucket[],
  rangeLabel: string,
  author = ''
): ReportData {
  const map = new Map<string, DayRow>()
  for (const b of mask) {
    const k = dayKey(b.t)
    let row = map.get(k)
    if (!row) {
      row = { key: k, label: th(b.t), total: 0, mask: 0, no_mask: 0, improper: 0 }
      map.set(k, row)
    }
    row.total += b.total
    row.mask += b.mask
    row.no_mask += b.no_mask
    row.improper += b.improper
  }
  const days = [...map.values()] // buckets arrive chronological → insertion order is too

  const totalPasses = days.reduce((a, d) => a + d.total, 0)
  const totalMask = days.reduce((a, d) => a + d.mask, 0)
  const maskRate = totalPasses > 0 ? Math.round((totalMask / totalPasses) * 100) : 0
  const pmAvg = pm.length ? Math.round(pm.reduce((a, s) => a + s.pm25, 0) / pm.length) : null

  const times = [...pm.map((s) => s.t), ...mask.map((b) => b.t)].sort()

  return {
    author,
    rangeLabel,
    rangeStart: times.length ? th(times[0]) : '—',
    rangeEnd: times.length ? th(times[times.length - 1]) : '—',
    generatedAt: new Date().toLocaleString('th-TH'),
    totalPasses,
    maskRate,
    pmAvg,
    dayCount: days.length,
    days
  }
}

function compliance(d: DayRow): number {
  return d.total > 0 ? Math.round((d.mask / d.total) * 100) : 0
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

/** Daily "people passed" bar chart as inline SVG (white theme, orange bars). */
function barChart(days: DayRow[]): string {
  const W = 900
  const Hh = 300
  const pad = { l: 44, r: 16, t: 16, b: 46 }
  const plotW = W - pad.l - pad.r
  const plotH = Hh - pad.t - pad.b
  const maxV = Math.max(1, ...days.map((d) => d.total))
  const step = plotW / days.length
  const barW = Math.min(46, step * 0.6)

  const yTicks = [0, 0.5, 1].map((f) => Math.round(maxV * f))
  const labelEvery = Math.ceil(days.length / 10)

  const bars = days
    .map((d, i) => {
      const h = (d.total / maxV) * plotH
      const x = pad.l + i * step + (step - barW) / 2
      const y = pad.t + (plotH - h)
      const showLabel = i % labelEvery === 0 || i === days.length - 1
      const label = showLabel
        ? `<text x="${x + barW / 2}" y="${Hh - pad.b + 16}" text-anchor="middle" font-size="11" fill="#666">${d.label}</text>`
        : ''
      return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="#FF7A1A"/>${label}`
    })
    .join('')

  const grid = yTicks
    .map((v) => {
      const y = pad.t + plotH - (v / maxV) * plotH
      return `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="#e5e5e5"/><text x="${pad.l - 8}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="11" fill="#999">${v}</text>`
    })
    .join('')

  return `<svg viewBox="0 0 ${W} ${Hh}" width="100%" preserveAspectRatio="xMidYMid meet">${grid}${bars}</svg>`
}

function tile(label: string, value: string): string {
  return `<div class="tile"><div class="tile-l">${label}</div><div class="tile-v">${value}</div></div>`
}

export function renderReportHtml(d: ReportData): string {
  const metrics =
    tile('รวมคนผ่าน', d.totalPasses.toLocaleString()) +
    tile('อัตราการใส่หน้ากาก', `${d.maskRate}%`) +
    tile('PM2.5 เฉลี่ย', d.pmAvg == null ? '—' : `${d.pmAvg} µg/m³`) +
    tile('จำนวนวัน', `${d.dayCount} วัน`)

  const rows = d.days
    .map(
      (r) => `<tr>
        <td>${r.label}</td>
        <td class="num">${r.total.toLocaleString()}</td>
        <td class="num">${r.mask.toLocaleString()}</td>
        <td class="num">${r.no_mask.toLocaleString()}</td>
        <td class="num">${r.improper.toLocaleString()}</td>
        <td class="num pctcol">${compliance(r)}%</td>
      </tr>`
    )
    .join('')

  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8"/>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Noto Sans Thai', 'Sarabun', 'Leelawadee UI', system-ui, sans-serif;
    color: #1a1a1a;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    position: relative;
    width: 210mm;
    height: 297mm;
    padding: 16mm 16mm 20mm;
    overflow: hidden;
  }
  .page + .page { page-break-before: always; }

  .brand { display: flex; align-items: center; gap: 14px; }
  .logo {
    width: 50px; height: 50px; border-radius: 50%;
    background: #FF7A1A; color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 27px; flex-shrink: 0;
  }
  .brand h1 { font-size: 20px; font-weight: 800; }
  .brand p { font-size: 12.5px; color: #555; margin-top: 2px; }
  .rule { height: 2px; background: #FF7A1A; margin: 14px 0 20px; border: 0; }

  .info { width: 100%; border-collapse: collapse; margin-bottom: 26px; font-size: 13px; }
  .info td { padding: 7px 0; vertical-align: top; }
  .info .k { color: #666; width: 130px; }
  .info .v { color: #1a1a1a; border-bottom: 1px dotted #bbb; }

  h2.section { font-size: 15px; font-weight: 800; color: #FF7A1A; margin-bottom: 12px; }

  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 26px; }
  .tile { border: 1px solid #e6e6e6; border-radius: 10px; padding: 14px; background: #fafafa; }
  .tile-l { font-size: 11.5px; color: #666; margin-bottom: 8px; }
  .tile-v { font-size: 22px; font-weight: 800; color: #1a1a1a; }

  .chart-cap { font-size: 12.5px; color: #555; margin-bottom: 6px; }
  .chart { border: 1px solid #eee; border-radius: 10px; padding: 10px; }

  .subhead { display: flex; align-items: baseline; justify-content: space-between; }
  .subhead .l { font-size: 15px; font-weight: 800; }
  .subhead .r { font-size: 12.5px; color: #555; }

  table.detail { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12.5px; }
  table.detail th, table.detail td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #ececec; }
  table.detail thead th { background: #fff3ea; color: #b3550f; font-weight: 700; border-bottom: 1.5px solid #FF7A1A; }
  table.detail td.num { text-align: right; font-variant-numeric: tabular-nums; }
  table.detail td.pctcol { color: #FF7A1A; font-weight: 800; }
  table.detail tbody tr:nth-child(even) { background: #fbfbfb; }

  .footer {
    position: absolute; left: 16mm; right: 16mm; bottom: 12mm;
    display: flex; justify-content: space-between;
    font-size: 11px; color: #999;
    border-top: 1px solid #eee; padding-top: 8px;
  }
</style>
</head>
<body>
  <!-- Page 1 -->
  <section class="page">
    <div class="brand">
      <div class="logo">A</div>
      <div>
        <h1>รายงานสรุปการดำเนินงาน</h1>
        <p>โครงการ AERIS ระบบตรวจวัดคุณภาพอากาศและติดตามการสวมหน้ากากอนามัย</p>
      </div>
    </div>
    <hr class="rule"/>

    <table class="info">
      <tr><td class="k">ผู้จัดทำ</td><td class="v">${d.author ? esc(d.author) : '&nbsp;'}</td></tr>
      <tr><td class="k">อาจารย์ที่ปรึกษา</td><td class="v">&nbsp;</td></tr>
      <tr><td class="k">ช่วงข้อมูลที่เลือก</td><td class="v">${d.rangeLabel} (${d.rangeStart} – ${d.rangeEnd})</td></tr>
      <tr><td class="k">วันที่ออกรายงาน</td><td class="v">${d.generatedAt}</td></tr>
    </table>

    <h2 class="section">สรุปผลการดำเนินงาน</h2>
    <div class="tiles">${metrics}</div>

    <div class="chart-cap">ยอดคนผ่านรายวัน</div>
    <div class="chart">${barChart(d.days)}</div>

    <div class="footer"><span>AERIS Desktop App</span><span>หน้า 1/2</span></div>
  </section>

  <!-- Page 2 -->
  <section class="page">
    <div class="subhead">
      <span class="l">ข้อมูลรายวัน</span>
      <span class="r">${d.rangeStart} – ${d.rangeEnd}</span>
    </div>
    <hr class="rule"/>

    <table class="detail">
      <thead>
        <tr>
          <th>วันที่</th><th>ผ่านทั้งหมด</th><th>ใส่แมส</th>
          <th>ไม่ใส่</th><th>ไม่ถูกต้อง</th><th>Compliance %</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="footer"><span>AERIS Desktop App</span><span>หน้า 2/2</span></div>
  </section>
</body>
</html>`
}
