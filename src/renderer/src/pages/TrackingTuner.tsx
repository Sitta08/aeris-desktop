import { useEffect, useState } from 'react'
import { BYTETRACK_PARAM_SPECS, type ByteTrackConfig } from '@shared/types'
import './tracking-tuner.css'

/**
 * Tools → Tracking Tuner — adjusts ByteTrackConfig, the person-tracker's
 * matching parameters, via the tracking layer (mock until the Pi's
 * /api/tracking/config exists — see docs/pi-tracking-config-endpoint.md).
 *
 * The form is driven entirely by BYTETRACK_PARAM_SPECS (shared with the main
 * process), so a new parameter only needs adding there, not here.
 */
export default function TrackingTuner(): JSX.Element {
  const [values, setValues] = useState<ByteTrackConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'apply' | 'reset' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    window.aeris.tracking
      .getConfig()
      .then((cfg) => active && setValues(cfg))
      .catch((e: unknown) => active && setError(errMsg(e)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const setField = (key: keyof ByteTrackConfig, raw: number): void => {
    if (!values) return
    setValues({ ...values, [key]: raw })
  }

  const onApply = async (): Promise<void> => {
    if (!values) return
    setBusy('apply')
    setError(null)
    try {
      const applied = await window.aeris.tracking.applyConfig(values)
      setValues(applied)
      setSavedAt(new Date().toLocaleTimeString())
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const onReset = async (): Promise<void> => {
    setBusy('reset')
    setError(null)
    try {
      const defaults = await window.aeris.tracking.resetConfig()
      setValues(defaults)
      setSavedAt(new Date().toLocaleTimeString())
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const disabled = busy !== null || loading || !values

  return (
    <div className="page">
      <div className="tt">
        <header className="tt__head">
          <div>
            <h1 className="tt__title">Tracking Tuner</h1>
            <div className="tt__sub">ByteTrack — พารามิเตอร์การติดตามบุคคล</div>
          </div>
        </header>

        <div className="tt__notice">
          ✅ พารามิเตอร์ยืนยันตรงกับ tracker จริงบน Pi แล้ว — ค่าที่ปรับส่งไปมีผลกับ
          ByteTrack จริง <strong>ยกเว้น Process Noise (Position/Velocity)</strong> ที่ Pi
          รับค่าไว้แต่ tracker <strong>ยังไม่นำไปใช้จริง</strong> (มี badge
          <span className="tt-field__pending"> ⏳ รอ implement</span> กำกับไว้)
        </div>

        <section className="tt__panel">
          <div className="tt__panel-head">
            <span className="tt__label">ByteTrackConfig</span>
            <span className="tt__hint">/api/tracking/config</span>
          </div>

          {loading ? (
            <div className="tt__empty">กำลังโหลดค่าปัจจุบัน…</div>
          ) : (
            values && (
              <div className="tt__fields">
                {BYTETRACK_PARAM_SPECS.map((spec) => (
                  <div className="tt-field" key={spec.key}>
                    <div className="tt-field__head">
                      <label htmlFor={spec.key}>
                        {spec.label}
                        {spec.pending && (
                          <span
                            className="tt-field__pending"
                            title="Pi รับค่าไว้แต่ tracker ยังไม่นำไปใช้จริง"
                          >
                            ⏳ รอ implement
                          </span>
                        )}
                      </label>
                      <input
                        type="number"
                        className="tt-field__num"
                        min={spec.min}
                        max={spec.max}
                        step={spec.step}
                        value={values[spec.key]}
                        disabled={disabled}
                        onChange={(e) => setField(spec.key, Number(e.target.value))}
                        onBlur={() =>
                          setField(spec.key, clamp(values[spec.key], spec.min, spec.max))
                        }
                      />
                    </div>
                    <input
                      id={spec.key}
                      type="range"
                      className="tt-field__slider"
                      min={spec.min}
                      max={spec.max}
                      step={spec.step}
                      value={values[spec.key]}
                      disabled={disabled}
                      onChange={(e) => setField(spec.key, Number(e.target.value))}
                    />
                    <div className="tt-field__range">
                      <span>{spec.min}</span>
                      <span>{spec.max}</span>
                    </div>
                    <p className="tt-field__desc">{spec.description}</p>
                  </div>
                ))}
              </div>
            )
          )}

          <div className="tt__actions">
            <button type="button" className="tt__primary" onClick={() => void onApply()} disabled={disabled}>
              {busy === 'apply' ? 'กำลัง Apply…' : 'Apply'}
            </button>
            <button
              type="button"
              className="tt__secondary"
              onClick={() => void onReset()}
              disabled={disabled}
            >
              {busy === 'reset' ? 'กำลังรีเซ็ต…' : 'Reset to Default'}
            </button>
            {savedAt && !error && <span className="tt__saved">ส่งไป Pi แล้ว · {savedAt}</span>}
          </div>

          {error && <div className="tt__error">Tracking API error: {error}</div>}
        </section>
      </div>
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
