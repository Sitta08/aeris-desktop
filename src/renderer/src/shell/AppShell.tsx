import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Role } from '@shared/types'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { pagesForRole } from '../pages/registry'
import './shell.css'

/**
 * The shell: loaded once, never re-mounted. Sidebar + top bar stay fixed;
 * only the component in the content slot swaps when a page is selected —
 * no full-page reload, SPA-style.
 *
 * The visible page set is filtered by the current user's role. The sidebar can
 * be pinned open (content then reserves space for it) or left to auto-hide.
 */
const PIN_KEY = 'aeris.sidebarPinned'

export default function AppShell({ role }: { role: Role }): JSX.Element {
  const pages = useMemo(() => pagesForRole(role), [role])
  const [activeId, setActiveId] = useState<string>(pages[0].id)
  const [pinned, setPinned] = useState<boolean>(() => localStorage.getItem(PIN_KEY) === '1')

  // UI preference only — safe to keep in localStorage (no session data here).
  const togglePin = useCallback(() => {
    setPinned((prev) => {
      const next = !prev
      localStorage.setItem(PIN_KEY, next ? '1' : '0')
      return next
    })
  }, [])

  // guard: if the active page isn't in the current role's set, fall back.
  const active = pages.find((p) => p.id === activeId) ?? pages[0]
  const ActivePage = active.component

  // Auto-hide scrollbar: reveal it only while scrolling, then fade it out.
  const contentRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    let t: ReturnType<typeof setTimeout>
    const onScroll = (): void => {
      el.dataset.scrolling = 'true'
      clearTimeout(t)
      t = setTimeout(() => (el.dataset.scrolling = 'false'), 900)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      clearTimeout(t)
    }
  }, [])

  return (
    <div className={`shell ${pinned ? 'is-pinned' : ''}`}>
      {/* top bar spans the full width; the sidebar starts below it, so the
          avatar toggle never shifts when the panel opens */}
      <TopBar activeLabel={active.label} sidebarOpen={pinned} onToggleSidebar={togglePin} />

      <div className="shell__body">
          <Sidebar
          pages={pages}
          role={role}
          activeId={active.id}
          onSelect={setActiveId}
          pinned={pinned}
        />
        <main className="shell__content" ref={contentRef} data-scrolling="false">
          {/* key by id so each page gets a fresh mount when switched to */}
          <ActivePage key={active.id} />
        </main>
      </div>
    </div>
  )
}
