import { useState, type FormEvent } from 'react'
import { useAuth } from '../state/AuthProvider'
import './auth.css'

type View = 'login' | 'signup' | 'pending'

/**
 * The pre-shell auth flow. Shown by AuthGate whenever there is no valid
 * session. Handles login, signup, and the "waiting for approval" state for
 * newly-created pending accounts — all before the shell ever mounts.
 */
export default function AuthScreens(): JSX.Element {
  const { login, signup } = useAuth()
  const [view, setView] = useState<View>('login')

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reset = (next: View): void => {
    setError(null)
    setPassword('')
    setShowPassword(false)
    setFirstName('')
    setLastName('')
    setView(next)
  }

  const onLogin = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await login(username.trim(), password)
      // on success AuthProvider flips session → AuthGate swaps to the shell.
      if (!res.ok) setError(res.reason)
    } finally {
      setBusy(false)
    }
  }

  const onSignup = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await signup(username.trim(), password, firstName.trim(), lastName.trim())
      if (!res.ok) {
        setError(res.reason)
        return
      }
      if (res.role === 'pending') {
        setView('pending')
      } else {
        // first user (admin) — send them to log in.
        setPassword('')
        setView('login')
        setError('สร้างบัญชีผู้ดูแลระบบสำเร็จ — เข้าสู่ระบบได้เลย')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <span className="auth__brand-mark">A</span>
          <span className="auth__brand-name">AERIS</span>
        </div>

        {view === 'pending' ? (
          <PendingView onBack={() => reset('login')} />
        ) : (
          <>
            <h1 className="auth__title">{view === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}</h1>
            <p className="auth__sub">
              {view === 'login'
                ? 'เข้าสู่ระบบเพื่อใช้งาน AERIS Desktop'
                : 'สร้างบัญชีใหม่ (ผู้ใช้คนแรกจะเป็นผู้ดูแลระบบ)'}
            </p>

            <form onSubmit={view === 'login' ? onLogin : onSignup} className="auth__form">
              {view === 'signup' && (
                <div className="auth__row">
                  <label className="auth__field">
                    <span>ชื่อ</span>
                    <input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      autoComplete="given-name"
                      required
                    />
                  </label>
                  <label className="auth__field">
                    <span>นามสกุล</span>
                    <input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      autoComplete="family-name"
                      required
                    />
                  </label>
                </div>
              )}

              <label className="auth__field">
                <span>ชื่อผู้ใช้</span>
                <input
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  minLength={3}
                />
              </label>
              <label className="auth__field">
                <span>รหัสผ่าน</span>
                <div className="auth__password">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={view === 'login' ? 'current-password' : 'new-password'}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    className="auth__eye"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                    aria-pressed={showPassword}
                    title={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </label>

              {error && <div className="auth__msg">{error}</div>}

              <button type="submit" className="auth__submit" disabled={busy}>
                {busy ? 'กำลังดำเนินการ…' : view === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
              </button>
            </form>

            <div className="auth__switch">
              {view === 'login' ? (
                <>
                  ยังไม่มีบัญชี?{' '}
                  <button type="button" onClick={() => reset('signup')}>
                    สมัครสมาชิก
                  </button>
                </>
              ) : (
                <>
                  มีบัญชีอยู่แล้ว?{' '}
                  <button type="button" onClick={() => reset('login')}>
                    เข้าสู่ระบบ
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function PendingView({ onBack }: { onBack: () => void }): JSX.Element {
  return (
    <div className="auth__pending">
      <div className="auth__pending-icon">⏳</div>
      <h1 className="auth__title">รอการอนุมัติ</h1>
      <p className="auth__sub">
        สมัครสมาชิกสำเร็จแล้ว บัญชีของคุณกำลังรอผู้ดูแลระบบอนุมัติ
        <br />
        เมื่อได้รับการอนุมัติแล้วจึงจะเข้าสู่ระบบได้
      </p>
      <button type="button" className="auth__submit" onClick={onBack}>
        กลับไปหน้าเข้าสู่ระบบ
      </button>
    </div>
  )
}

/* ── password visibility icons ── */

function EyeIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon(): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17.94 17.94A10.5 10.5 0 0 1 12 20C5 20 1 13 1 13a19 19 0 0 1 5.06-5.94M9.9 4.24A9.5 9.5 0 0 1 12 4c7 0 11 7 11 7a19 19 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="M1 1l22 22" />
    </svg>
  )
}
