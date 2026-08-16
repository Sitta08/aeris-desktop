import { AuthProvider, useAuth } from './state/AuthProvider'
import { ConnectionProvider } from './state/ConnectionProvider'
import AppShell from './shell/AppShell'
import AuthScreens from './auth/AuthScreens'

/**
 * Root. The AuthProvider gates everything: until there is a valid stored
 * session, the user sees the login/signup flow and the shell never mounts.
 */
export default function App(): JSX.Element {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

function Gate(): JSX.Element {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="auth">
        <div className="auth__card" style={{ alignItems: 'center' }}>
          <div className="auth__brand">
            <span className="auth__brand-mark">A</span>
            <span className="auth__brand-name">AERIS</span>
          </div>
          <p className="auth__sub">กำลังตรวจสอบเซสชัน…</p>
        </div>
      </div>
    )
  }

  if (!session) return <AuthScreens />

  // authenticated → mount the shell (dongle connection only starts here).
  return (
    <ConnectionProvider>
      <AppShell role={session.role} />
    </ConnectionProvider>
  )
}
