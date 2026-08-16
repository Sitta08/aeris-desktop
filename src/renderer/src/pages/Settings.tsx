import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import type { SystemInfo } from '@shared/types'
import { useAuth } from '../state/AuthProvider'
import Modal from '../ui/Modal'
import AdminSection from './AdminSection'
import './settings.css'

/**
 * Settings / About — current account, live Pi temperatures, and the account
 * actions (user management for admins, plus Logout).
 */
const INFO_POLL_MS = 5000

export default function Settings(): JSX.Element {
  const { session, logout, avatar, setAvatar, clearAvatar } = useAuth()
  const [busy, setBusy] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const fullName = [session?.firstName, session?.lastName].filter(Boolean).join(' ').trim()

  const onPickAvatar = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return

    setAvatarError(null)
    try {
      if (!file.type.startsWith('image/')) throw new Error('กรุณาเลือกไฟล์รูปภาพ')
      if (file.size > 8 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน 8 MB')
      await setAvatar(await toSquareDataUrl(file, 256))
    } catch (err) {
      setAvatarError(errMsg(err))
    }
  }

  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [infoError, setInfoError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const tick = (): void => {
      window.aeris.api
        .getSystemInfo()
        .then((i) => {
          if (!active) return
          setInfo(i)
          setInfoError(null)
        })
        .catch((e: unknown) => active && setInfoError(errMsg(e)))
    }
    tick()
    const id = setInterval(tick, INFO_POLL_MS)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [])

  const onLogout = async (): Promise<void> => {
    setBusy(true)
    // AuthProvider drops the session → App's gate swaps back to the login screen.
    await logout()
  }

  return (
    <div className="page">
      <div className="settings">
        <h1 className="settings__title">Settings</h1>

        <section className="settings__card">
          <div className="settings__label">บัญชีผู้ใช้</div>

          <div className="settings__profile">
            <div className="settings__avatar">
              {avatar ? (
                <img src={avatar} alt="" className="settings__avatar-img" />
              ) : (
                <span className="settings__avatar-initial">
                  {(session?.username?.trim()?.[0] ?? '?').toUpperCase()}
                </span>
              )}
            </div>

            <div className="settings__profile-main">
              <div className="settings__account">
                <span className="settings__user">{session?.username ?? '—'}</span>
                <span className={`role role--${session?.role ?? 'user'}`}>{session?.role}</span>
              </div>
              {session && (
                <div className="settings__hint">
                  เซสชันหมดอายุ: {new Date(session.expiresAt).toLocaleString()}
                </div>
              )}
              <div className="settings__avatar-actions">
                <button
                  type="button"
                  className="settings__mini"
                  onClick={() => fileInput.current?.click()}
                >
                  อัปโหลดรูปโปรไฟล์
                </button>
                {avatar && (
                  <button
                    type="button"
                    className="settings__mini settings__mini--ghost"
                    onClick={() => {
                      setAvatarError(null)
                      void clearAvatar()
                    }}
                  >
                    ลบรูป
                  </button>
                )}
              </div>
              {avatarError && <div className="settings__error">{avatarError}</div>}
            </div>
          </div>

          {/* display name — set once at signup, shown as ผู้จัดทำ on reports */}
          <div className="settings__name">
            <span className="settings__name-label">ชื่อ-นามสกุล</span>
            <span className="settings__name-value">
              {fullName || <span className="settings__name-empty">— ยังไม่ได้ตั้ง —</span>}
            </span>
          </div>

          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={onPickAvatar}
          />
        </section>

        {/* live load / temps / attached accelerator */}
        <section className="settings__card">
          <div className="settings__label">INFO Load &amp; Temp</div>

          {infoError ? (
            <div className="settings__hint">โหลดข้อมูลระบบไม่ได้: {infoError}</div>
          ) : (
            <div className="info">
              <InfoGroup title="Raspberry Pi 5">
                <Metric
                  label="CPU Load"
                  value={info?.cpu_usage_pct}
                  unit="%"
                  pct={info?.cpu_usage_pct}
                  level={info ? loadLevel(info.cpu_usage_pct) : undefined}
                />
                <Metric
                  label="CPU Temp"
                  value={info?.cpu_temp_c}
                  unit="°C"
                  level={info ? tempLevel(info.cpu_temp_c) : undefined}
                />
                <Metric
                  label="Memory"
                  value={info?.mem_usage_pct}
                  unit="%"
                  pct={info?.mem_usage_pct}
                  level={info ? loadLevel(info.mem_usage_pct) : undefined}
                  sub={
                    info ? `${fmtGb(info.mem_used_mb)} / ${fmtGb(info.mem_total_mb)} GB` : undefined
                  }
                />
              </InfoGroup>

              <InfoGroup
                title="AI HAT+ · Hailo-8L"
                badge={
                  info ? (
                    <span className={`info__badge ${info.hailo_present ? 'is-on' : 'is-off'}`}>
                      {info.hailo_present ? 'เชื่อมต่ออยู่' : 'ไม่พบอุปกรณ์'}
                    </span>
                  ) : undefined
                }
              >
                <Metric
                  label="NPU Load"
                  value={info?.hailo_usage_pct}
                  unit="%"
                  pct={info?.hailo_usage_pct ?? undefined}
                  level={
                    info?.hailo_usage_pct != null ? loadLevel(info.hailo_usage_pct) : undefined
                  }
                />
                <Metric
                  label="NPU Temp"
                  value={info?.hailo_temp_c}
                  unit="°C"
                  level={info?.hailo_temp_c != null ? tempLevel(info.hailo_temp_c) : undefined}
                />
              </InfoGroup>

              <InfoGroup title="สภาพแวดล้อม">
                <Metric label="อุณหภูมิโดยรอบ" value={info?.ambient_temp_c} unit="°C" />
                <Metric label="ความชื้นสัมพัทธ์" value={info?.humidity_pct} unit="%" />
              </InfoGroup>
            </div>
          )}
        </section>

        <section className="settings__card">
          <div className="settings__label">About</div>
          <div className="settings__hint">AERIS Desktop · v0.1.0</div>
        </section>

        {/* account actions — user management sits next to Logout.
            The dialog is the seam where a password re-confirmation step will
            go later (see docs/admin-access-hardening.md). */}
        <div className="settings__actions">
          {session?.role === 'admin' && (
            <button type="button" className="settings__action" onClick={() => setAdminOpen(true)}>
              จัดการผู้ใช้
            </button>
          )}
          <button className="settings__logout" onClick={onLogout} disabled={busy}>
            {busy ? 'กำลังออกจากระบบ…' : 'ออกจากระบบ (Logout)'}
          </button>
        </div>
      </div>

      <Modal open={adminOpen} title="จัดการผู้ใช้" onClose={() => setAdminOpen(false)}>
        <AdminSection />
      </Modal>
    </div>
  )
}

/* ── helpers ── */

type Level = 'cool' | 'warm' | 'hot'

function InfoGroup({
  title,
  badge,
  children
}: {
  title: string
  badge?: ReactNode
  children: ReactNode
}): JSX.Element {
  return (
    <div className="info__group">
      <div className="info__group-head">
        <span className="info__group-title">{title}</span>
        {badge}
      </div>
      <div className="info__metrics">{children}</div>
    </div>
  )
}

function Metric({
  label,
  value,
  unit,
  pct,
  level,
  sub
}: {
  label: string
  value: number | null | undefined
  unit: string
  /** 0–100; renders a load meter under the value. */
  pct?: number | null
  level?: Level
  sub?: string
}): JSX.Element {
  return (
    <div className={`metric ${level ? `metric--${level}` : ''}`}>
      <div className="metric__label">{label}</div>
      <div className="metric__value">
        {value == null ? <span className="metric__na">—</span> : value}
        {value != null && <span className="metric__unit">{unit}</span>}
      </div>
      {pct != null && (
        <div className="metric__meter">
          <div className="metric__meter-fill" style={{ width: `${clampPct(pct)}%` }} />
        </div>
      )}
      {sub && <div className="metric__sub">{sub}</div>}
    </div>
  )
}

/** Pi 5 starts throttling around 80–85 °C. */
function tempLevel(c: number): Level {
  if (c >= 75) return 'hot'
  if (c >= 60) return 'warm'
  return 'cool'
}

function loadLevel(pct: number): Level {
  if (pct >= 85) return 'hot'
  if (pct >= 60) return 'warm'
  return 'cool'
}

function clampPct(n: number): number {
  return Math.min(100, Math.max(0, n))
}

function fmtGb(mb: number): string {
  return (mb / 1024).toFixed(1)
}

/**
 * Read an image file and return a square, centre-cropped JPEG data URL.
 * Downscaling here keeps the stored avatar a few tens of KB instead of
 * shipping a multi-megabyte original through IPC and onto disk.
 */
function toSquareDataUrl(file: File, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('ไฟล์รูปไม่ถูกต้องหรือเสียหาย'))
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('เบราว์เซอร์ไม่รองรับการย่อรูป'))

        // cover-fit: scale so the shorter side fills, then centre it
        const scale = Math.max(size / img.width, size / img.height)
        const w = img.width * scale
        const h = img.height * scale
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)

        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
