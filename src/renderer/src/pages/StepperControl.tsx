import { useEffect, useMemo, useState } from 'react'
import type {
  StepperAxis,
  StepperDirection,
  StepperMotorStatus,
  StepperMoveRequest,
  StepperTeachPoint
} from '@shared/types'
import './stepper.css'

const STATUS_POLL_MS = 2500
const MIN_STEPS = 1
const MAX_STEPS = 200000
const MIN_SPEED = 1
const MAX_SPEED = 4000
const MIN_DWELL = 0
const MAX_DWELL = 10000

const MOTOR_TARGETS: Array<{ axis: StepperAxis; label: string; hint: string }> = [
  { axis: 'x', label: 'คอ', hint: 'X axis' },
  { axis: 'y', label: 'แขนซ้าย', hint: 'Y axis' },
  { axis: 'z', label: 'แขนขวา', hint: 'Z axis' }
]

export default function StepperControl(): JSX.Element {
  const [axis, setAxis] = useState<StepperAxis>('x')
  const [direction, setDirection] = useState<StepperDirection>('cw')
  const [steps, setSteps] = useState(200)
  const [speed, setSpeed] = useState(400)
  const [teachName, setTeachName] = useState('Point A')
  const [dwell, setDwell] = useState(300)
  const [repeat, setRepeat] = useState(1)
  const [points, setPoints] = useState<StepperTeachPoint[]>([])
  const [status, setStatus] = useState<StepperMotorStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<
    'move' | 'home' | 'stop' | 'refresh' | 'save-point' | 'play-sequence' | null
  >(null)

  const moveRequest = useMemo<StepperMoveRequest>(
    () => ({
      axis,
      direction,
      steps: clampInt(steps, MIN_STEPS, MAX_STEPS),
      speed_sps: clampInt(speed, MIN_SPEED, MAX_SPEED)
    }),
    [axis, direction, speed, steps]
  )

  const refresh = async (kind: typeof busy = 'refresh'): Promise<void> => {
    setBusy(kind)
    try {
      const next = await window.aeris.api.getStepperStatus()
      setStatus(next)
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    let active = true

    const tick = (): void => {
      window.aeris.api
        .getStepperStatus()
        .then((next) => {
          if (!active) return
          setStatus(next)
          setError(null)
        })
        .catch((e: unknown) => active && setError(errMsg(e)))
    }

    tick()
    const id = setInterval(tick, STATUS_POLL_MS)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [])

  const runMove = async (): Promise<void> => {
    setBusy('move')
    try {
      const next = await window.aeris.api.moveStepper(moveRequest)
      setStatus(next)
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const runHome = async (): Promise<void> => {
    setBusy('home')
    try {
      const next = await window.aeris.api.homeStepper({
        axis,
        speed_sps: clampInt(speed, MIN_SPEED, MAX_SPEED)
      })
      setStatus(next)
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const runStop = async (): Promise<void> => {
    setBusy('stop')
    try {
      const next = await window.aeris.api.stopStepper()
      setStatus(next)
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const saveCurrentPoint = async (): Promise<void> => {
    const positions = positionsFromStatus(status)
    const point: StepperTeachPoint = {
      id: makePointId(),
      name: teachName.trim() || `Point ${points.length + 1}`,
      positions,
      speed_sps: clampInt(speed, MIN_SPEED, MAX_SPEED),
      dwell_ms: clampInt(dwell, MIN_DWELL, MAX_DWELL)
    }

    setBusy('save-point')
    try {
      const saved = await window.aeris.api.saveStepperTeachPoint(point)
      setPoints((prev) => [...prev, saved])
      setTeachName(nextPointName(points.length + 1))
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const removePoint = (id: string): void => {
    setPoints((prev) => prev.filter((p) => p.id !== id))
  }

  const playSequence = async (): Promise<void> => {
    if (points.length < 2) {
      setError('ต้องมี waypoint อย่างน้อย 2 จุดก่อนเล่น sequence')
      return
    }

    setBusy('play-sequence')
    try {
      const next = await window.aeris.api.playStepperSequence({
        name: 'Mask warning motion',
        points,
        repeat: clampInt(repeat, 1, 20)
      })
      setStatus(next)
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const disabled = busy !== null
  const positions = positionsFromStatus(status)

  return (
    <div className="page">
      <div className="stepper">
        {/* header */}
        <header className="stepper__head">
          <div>
            <h1 className="stepper__title">Stepper Control</h1>
            <div className="stepper__sub">Arduino CNC Shield · A4988</div>
          </div>
          <div className="stepper__head-right">
            <span className={`conn-pill ${status?.connected ? 'is-on' : 'is-off'}`}>
              <span className="conn-pill__dot" />
              {status?.connected ? 'เชื่อมต่อแล้ว' : 'ไม่ได้เชื่อมต่อ'}
            </span>
            <button
              type="button"
              className="stepper__ghost"
              onClick={() => void refresh('refresh')}
              disabled={disabled}
            >
              {busy === 'refresh' ? 'กำลังรีเฟรช…' : 'Refresh'}
            </button>
          </div>
        </header>

        {/* consolidated status bar: positions + motion + last command */}
        <section className="statusbar">
          <div className="statusbar__pos">
            {MOTOR_TARGETS.map((t) => (
              <div key={t.axis} className={`poschip ${axis === t.axis ? 'is-active' : ''}`}>
                <span className="poschip__name">{t.label}</span>
                <span className="poschip__val">{positions[t.axis].toLocaleString()}</span>
                <span className="poschip__unit">steps · {t.axis.toUpperCase()}</span>
              </div>
            ))}
          </div>

          <div className="statusbar__side">
            <span className={`motion ${status?.moving ? 'is-moving' : 'is-idle'}`}>
              <span className="motion__dot" />
              {status?.moving ? 'กำลังเคลื่อนที่' : 'หยุดนิ่ง'}
            </span>
            <div className="statusbar__last">
              <span className="statusbar__k">คำสั่งล่าสุด</span>
              <span className="statusbar__v">{status?.last_command ?? '—'}</span>
            </div>
            <div className="statusbar__updated">
              อัปเดต: {status ? new Date(status.updated_at).toLocaleTimeString() : '—'}
              {status?.error ? ` · ${status.error}` : ''}
            </div>
          </div>
        </section>

        {error && <div className="stepper__error">Motor API error: {error}</div>}

        <div className="stepper__cols">
          {/* Motion command */}
          <section className="stepper__panel">
            <div className="stepper__panel-head">
              <span className="stepper__label">สั่งการเคลื่อนที่ (Jog)</span>
              <span className="stepper__hint">/api/motor/move</span>
            </div>

            <div className="stepper__field">
              <span>เลือกมอเตอร์</span>
              <div className="motor-picks" role="group" aria-label="Motor target">
                {MOTOR_TARGETS.map((target) => (
                  <button
                    type="button"
                    key={target.axis}
                    className={axis === target.axis ? 'is-active' : ''}
                    onClick={() => setAxis(target.axis)}
                  >
                    <span className="motor-picks__label">{target.label}</span>
                    <span className="motor-picks__hint">{target.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="stepper__grid stepper__grid--two">
              <div className="stepper__field">
                <span>ทิศทาง</span>
                <div className="stepper__segments" role="group" aria-label="Direction">
                  <button
                    type="button"
                    className={direction === 'cw' ? 'is-active' : ''}
                    onClick={() => setDirection('cw')}
                  >
                    CW
                  </button>
                  <button
                    type="button"
                    className={direction === 'ccw' ? 'is-active' : ''}
                    onClick={() => setDirection('ccw')}
                  >
                    CCW
                  </button>
                </div>
              </div>

              <label className="stepper__field">
                <span>จำนวน Steps</span>
                <input
                  type="number"
                  min={MIN_STEPS}
                  max={MAX_STEPS}
                  step={1}
                  value={steps}
                  onChange={(e) => setSteps(Number(e.target.value))}
                  onBlur={() => setSteps(clampInt(steps, MIN_STEPS, MAX_STEPS))}
                />
              </label>

              <label className="stepper__field">
                <span>ความเร็ว</span>
                <div className="stepper__number">
                  <input
                    type="number"
                    min={MIN_SPEED}
                    max={MAX_SPEED}
                    step={10}
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    onBlur={() => setSpeed(clampInt(speed, MIN_SPEED, MAX_SPEED))}
                  />
                  <span>sps</span>
                </div>
              </label>
            </div>

            <div className="stepper__actions">
              <button
                type="button"
                className="stepper__primary"
                onClick={() => void runMove()}
                disabled={disabled}
              >
                {busy === 'move' ? 'กำลังเคลื่อนที่…' : 'Move'}
              </button>
              <button
                type="button"
                className="stepper__secondary"
                onClick={() => void runHome()}
                disabled={disabled}
              >
                {busy === 'home' ? 'กำลัง Home…' : 'Home'}
              </button>
              <button
                type="button"
                className="stepper__danger"
                onClick={() => void runStop()}
                disabled={disabled}
              >
                {busy === 'stop' ? 'กำลังหยุด…' : 'Stop'}
              </button>
            </div>
          </section>

          {/* Teach & Playback */}
          <section className="stepper__panel">
            <div className="stepper__panel-head">
              <span className="stepper__label">Teach &amp; Playback</span>
              <span className="stepper__hint">teach-points · sequences/play</span>
            </div>

            <div className="stepper__grid stepper__grid--two">
              <label className="stepper__field stepper__field--wide">
                <span>ชื่อ Waypoint</span>
                <input
                  type="text"
                  value={teachName}
                  onChange={(e) => setTeachName(e.target.value)}
                  placeholder="Point A"
                />
              </label>

              <label className="stepper__field">
                <span>Dwell</span>
                <div className="stepper__number">
                  <input
                    type="number"
                    min={MIN_DWELL}
                    max={MAX_DWELL}
                    step={50}
                    value={dwell}
                    onChange={(e) => setDwell(Number(e.target.value))}
                    onBlur={() => setDwell(clampInt(dwell, MIN_DWELL, MAX_DWELL))}
                  />
                  <span>ms</span>
                </div>
              </label>

              <label className="stepper__field">
                <span>เล่นซ้ำ</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  value={repeat}
                  onChange={(e) => setRepeat(Number(e.target.value))}
                  onBlur={() => setRepeat(clampInt(repeat, 1, 20))}
                />
              </label>
            </div>

            <div className="stepper__actions">
              <button
                type="button"
                className="stepper__primary"
                onClick={() => void saveCurrentPoint()}
                disabled={disabled || !status}
              >
                {busy === 'save-point' ? 'กำลังบันทึก…' : 'บันทึกจุดปัจจุบัน'}
              </button>
              <button
                type="button"
                className="stepper__secondary"
                onClick={() => void playSequence()}
                disabled={disabled || points.length < 2}
              >
                {busy === 'play-sequence' ? 'กำลังเล่น…' : 'เล่น Sequence'}
              </button>
            </div>

            <div className="teach-list">
              {points.length === 0 ? (
                <div className="teach-list__empty">
                  Jog ไปตำแหน่งปลอดภัย แล้วกด “บันทึกจุดปัจจุบัน” เพื่อเก็บเป็น Point A
                </div>
              ) : (
                points.map((point, index) => (
                  <div className="teach-row" key={point.id}>
                    <div className="teach-row__index">{index + 1}</div>
                    <div className="teach-row__main">
                      <div className="teach-row__name">{point.name}</div>
                      <div className="teach-row__meta">
                        X {point.positions.x.toLocaleString()} · Y{' '}
                        {point.positions.y.toLocaleString()} · Z{' '}
                        {point.positions.z.toLocaleString()} · {point.speed_sps} sps · dwell{' '}
                        {point.dwell_ms} ms
                      </div>
                    </div>
                    <button
                      type="button"
                      className="teach-row__remove"
                      onClick={() => removePoint(point.id)}
                      disabled={disabled}
                    >
                      ลบ
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function positionsFromStatus(status: StepperMotorStatus | null): Record<StepperAxis, number> {
  if (status?.positions) return status.positions
  return {
    x: status?.position_steps ?? 0,
    y: 0,
    z: 0
  }
}

function makePointId(): string {
  return `pt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function nextPointName(index: number): string {
  const letter = String.fromCharCode(65 + (index % 26))
  return `Point ${letter}`
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
