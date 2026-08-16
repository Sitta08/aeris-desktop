import { useEffect, useState } from 'react'
import type { CalibrationConfig, DetectionRoi } from '@shared/types'
import './calibration.css'

export default function Calibration(): JSX.Element {
  const [config, setConfig] = useState<CalibrationConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'apply' | 'reset' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    window.aeris.api
      .getCalibration()
      .then((next) => active && setConfig(next))
      .catch((e: unknown) => active && setError(errMsg(e)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const setNumber = (
    key: keyof Omit<CalibrationConfig, 'roi' | 'updated_at' | 'apply_status'>,
    value: number
  ): void => {
    if (!config) return
    setConfig({ ...config, [key]: value })
  }

  const setRoi = (key: keyof DetectionRoi, value: number): void => {
    if (!config) return
    const roi = { ...config.roi, [key]: value }
    roi.x_pct = Math.min(roi.x_pct, 100 - roi.w_pct)
    roi.y_pct = Math.min(roi.y_pct, 100 - roi.h_pct)
    roi.w_pct = Math.min(roi.w_pct, 100 - roi.x_pct)
    roi.h_pct = Math.min(roi.h_pct, 100 - roi.y_pct)
    setConfig({ ...config, roi })
  }

  const apply = async (): Promise<void> => {
    if (!config) return
    setBusy('apply')
    setError(null)
    try {
      const next = await window.aeris.api.applyCalibration(config)
      setConfig(next)
      setSavedAt(new Date().toLocaleTimeString())
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const reset = async (): Promise<void> => {
    setBusy('reset')
    setError(null)
    try {
      const next = await window.aeris.api.resetCalibration()
      setConfig(next)
      setSavedAt(new Date().toLocaleTimeString())
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const disabled = busy !== null || loading || !config

  return (
    <div className="page">
      <div className="cal">
        <header className="cal__head">
          <div>
            <h1 className="cal__title">Calibration CAM</h1>
            <div className="cal__sub">thresholds · region of interest</div>
          </div>
        </header>

        <div className="cal__notice">
          ค่า threshold เช่น 0.65 → 0.80 จะใช้งานจริงได้เมื่อ Pi endpoint รับค่า บันทึก config
          และสั่ง detection pipeline โหลดค่าล่าสุด
        </div>

        {error && <div className="cal__error">Calibration API error: {error}</div>}

        {loading || !config ? (
          <section className="cal__empty">กำลังโหลด calibration…</section>
        ) : (
          <div className="cal__cols">
            <section className="cal__panel">
              <div className="cal__panel-head">
                <span>Detection Thresholds</span>
                <span>/api/calibration</span>
              </div>
              <Slider
                label="Detection confidence"
                value={config.detection_confidence}
                min={0.05}
                max={0.99}
                step={0.01}
                disabled={disabled}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => setNumber('detection_confidence', v)}
              />
              <Slider
                label="Mask confidence"
                value={config.mask_confidence}
                min={0.05}
                max={0.99}
                step={0.01}
                disabled={disabled}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => setNumber('mask_confidence', v)}
              />
              <Slider
                label="Tracker match threshold"
                value={config.tracker_match_threshold}
                min={0.05}
                max={0.99}
                step={0.01}
                disabled={disabled}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => setNumber('tracker_match_threshold', v)}
              />
            </section>

            <section className="cal__panel">
              <div className="cal__panel-head">
                <span>Region of Interest</span>
                <span>percent of frame</span>
              </div>
              <div className="roi-box">
                <div
                  className="roi-box__rect"
                  style={{
                    left: `${config.roi.x_pct}%`,
                    top: `${config.roi.y_pct}%`,
                    width: `${config.roi.w_pct}%`,
                    height: `${config.roi.h_pct}%`
                  }}
                />
              </div>
              <Slider label="X" value={config.roi.x_pct} min={0} max={95} step={1} disabled={disabled} onChange={(v) => setRoi('x_pct', v)} />
              <Slider label="Y" value={config.roi.y_pct} min={0} max={95} step={1} disabled={disabled} onChange={(v) => setRoi('y_pct', v)} />
              <Slider label="Width" value={config.roi.w_pct} min={5} max={100} step={1} disabled={disabled} format={(v) => `${v}%`} onChange={(v) => setRoi('w_pct', v)} />
              <Slider label="Height" value={config.roi.h_pct} min={5} max={100} step={1} disabled={disabled} format={(v) => `${v}%`} onChange={(v) => setRoi('h_pct', v)} />
            </section>

          </div>
        )}

        <footer className="cal__actions">
          <button type="button" className="cal__primary" onClick={() => void apply()} disabled={disabled}>
            {busy === 'apply' ? 'Applying…' : 'Apply'}
          </button>
          <button type="button" className="cal__secondary" onClick={() => void reset()} disabled={disabled}>
            {busy === 'reset' ? 'Resetting…' : 'Reset'}
          </button>
          <span className="cal__saved">
            {savedAt ? `บันทึกแล้ว · ${savedAt}` : `อัปเดตล่าสุด: ${formatTime(config?.updated_at)}`}
          </span>
          <ApplyReceipt
            message={config?.apply_status?.message}
            detail={config?.apply_status?.detail}
            at={config?.apply_status?.applied_at}
          />
        </footer>
      </div>
    </div>
  )
}

function ApplyReceipt({
  message,
  detail,
  at
}: {
  message?: string
  detail?: string
  at?: string
}): JSX.Element {
  return (
    <div className={`cal-receipt ${message ? 'is-live' : ''}`}>
      <span className="cal-receipt__dot" />
      <strong>{message ? 'Apply Confirmed' : 'Waiting for Pi'}</strong>
      <span>{detail ?? 'หลัง Apply ตรงนี้จะแสดงว่า backend ใช้ config ล่าสุดแล้ว'}</span>
      {at && <em>{formatTime(at)}</em>}
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  disabled,
  format = String,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  disabled: boolean
  format?: (value: number) => string
  onChange: (value: number) => void
}): JSX.Element {
  return (
    <div className="cal-slider">
      <div className="cal-slider__head">
        <label>{label}</label>
        <output>{format(value)}</output>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

function formatTime(iso?: string): string {
  return iso ? new Date(iso).toLocaleTimeString() : '—'
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
