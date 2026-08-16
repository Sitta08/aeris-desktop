import { useAuth } from '../state/AuthProvider'
import { useConnection } from '../state/ConnectionProvider'
import { BRAND_NAME, BRAND_TAGLINE } from './branding'
import type { ConnectionState } from '@shared/types'

interface TopBarProps {
  /** Label of the active page, shown as the current tab. */
  activeLabel: string
  /** Whether the sidebar is currently held open. */
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

/**
 * Fixed top bar: the user avatar (doubles as the sidebar toggle), the active
 * tab, and the live dongle connection status from Layer 1.
 */
export default function TopBar({
  activeLabel,
  sidebarOpen,
  onToggleSidebar
}: TopBarProps): JSX.Element {
  const status = useConnection()
  const { session, avatar } = useAuth()
  const state: ConnectionState = status?.state ?? 'disconnected'
  const initial = (session?.username?.trim()?.[0] ?? '?').toUpperCase()
  const toggleLabel = sidebarOpen ? 'ซ่อนแถบเมนู' : 'แสดงแถบเมนู'

  return (
    <header className="topbar">
      <div className="topbar__left">
        <button
          type="button"
          className={`topbar__avatar ${sidebarOpen ? 'is-active' : ''}`}
          onClick={onToggleSidebar}
          title={`${session?.username ?? ''} · ${toggleLabel}`}
          aria-label={toggleLabel}
          aria-pressed={sidebarOpen}
        >
          {avatar ? (
            <img src={avatar} alt="" className="topbar__avatar-img" />
          ) : (
            <span className="topbar__avatar-initial">{initial}</span>
          )}
        </button>

        <span className="topbar__divider" />
        <span className="topbar__tab">{activeLabel}</span>
      </div>

      {/* text lives in ./branding.ts */}
      <div className="topbar__brand">
        <div className="topbar__brand-name">{BRAND_NAME}</div>
        <div className="topbar__brand-tagline">{BRAND_TAGLINE}</div>
      </div>

      <div className="topbar__right">
        <span className={`conn conn--${state}`} title={status?.detail ?? ''}>
          <span className="conn__dot" />
          <span className="conn__label">{CONN_LABEL[state]}</span>
        </span>
      </div>
    </header>
  )
}

const CONN_LABEL: Record<ConnectionState, string> = {
  disconnected: 'Dongle offline',
  connecting: 'Connecting…',
  connected: 'Dongle connected',
  error: 'Dongle error'
}
