import { useEffect, useRef, useState } from 'react'
import type { Role } from '@shared/types'
import { groupedPages, type PageDef } from '../pages/registry'

interface SidebarProps {
  /** Pages to show — already filtered by role in AppShell. */
  pages: PageDef[]
  /** Used to hide whole sections (e.g. Tools is admin-only). */
  role: Role
  activeId: string
  onSelect: (id: string) => void
  /**
   * Held open by the avatar toggle in the top bar. When open the content
   * reserves space for the panel instead of being covered by it.
   */
  pinned: boolean
}

/** How long to wait after the mouse leaves before hiding, to avoid flicker. */
const CLOSE_DELAY_MS = 240

function SidebarButton({
  page,
  active,
  onSelect
}: {
  page: PageDef
  active: boolean
  onSelect: (id: string) => void
}): JSX.Element {
  return (
    <button
      type="button"
      className={`sb-item ${active ? 'is-active' : ''}`}
      onClick={() => onSelect(page.id)}
      title={page.label}
      aria-current={active ? 'page' : undefined}
    >
      <span className="sb-item__icon">{page.icon}</span>
      <span className="sb-item__label">{page.label}</span>
    </button>
  )
}

/**
 * Sidebar with two modes:
 *  • closed — auto-hide. A thin hover zone on the left edge lets you peek at
 *    the panel as an overlay; moving away hides it after a short delay.
 *  • open   — held open by the avatar toggle in the top bar; AppShell
 *    reserves space for it so it never covers the content.
 *
 * Items are grouped into sections (see PAGE_GROUPS in the registry). The thin
 * rail shown while the panel is hidden mirrors the same structure — heading
 * spacers included — so the active marker always lines up with its row. All
 * the heights come from shared CSS variables, so there are no magic numbers
 * to keep in sync.
 */
export default function Sidebar({
  pages,
  role,
  activeId,
  onSelect,
  pinned
}: SidebarProps): JSX.Element {
  const [hovered, setHovered] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()

  const clearCloseTimer = (): void => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = undefined
    }
  }

  const reveal = (): void => {
    clearCloseTimer()
    setHovered(true)
  }

  const scheduleHide = (): void => {
    clearCloseTimer()
    closeTimer.current = setTimeout(() => setHovered(false), CLOSE_DELAY_MS)
  }

  // don't leave a timer dangling if the shell unmounts
  useEffect(() => clearCloseTimer, [])

  // pinned wins: the panel is open regardless of where the pointer is
  const open = pinned || hovered

  const groups = groupedPages(pages, role)
  const bottomPages = pages.filter((p) => p.placement === 'bottom')

  return (
    <div
      className="sidebar-zone"
      data-open={open ? 'true' : 'false'}
      data-pinned={pinned ? 'true' : 'false'}
      onMouseEnter={reveal}
      onMouseLeave={scheduleHide}
    >
      {/* Rail: mirrors the panel's structure with invisible spacers so the
          active marker stays aligned with its row while the panel is hidden. */}
      <div className="sidebar-rail" aria-hidden="true">
        <div className="sidebar-rail__groups">
          {groups.map((g) => (
            <div key={g.id} className="rail-group">
              <div className="rail-head" />
              {g.items.length > 0 ? (
                g.items.map((p) => (
                  <span
                    key={p.id}
                    className={`rail-mark ${p.id === activeId ? 'is-active' : ''}`}
                  />
                ))
              ) : (
                <div className="rail-empty" />
              )}
            </div>
          ))}
        </div>

        {bottomPages.length > 0 && (
          <div className="rail-group rail-group--bottom">
            {bottomPages.map((p) => (
              <span key={p.id} className={`rail-mark ${p.id === activeId ? 'is-active' : ''}`} />
            ))}
          </div>
        )}
      </div>

      <nav className="sidebar" aria-label="Primary">
        <div className="sidebar__groups">
          {groups.map((g) => (
            <div key={g.id} className="sb-group">
              <div className="sb-group__head">{g.label}</div>
              {g.items.length > 0 ? (
                g.items.map((page) => (
                  <SidebarButton
                    key={page.id}
                    page={page}
                    active={page.id === activeId}
                    onSelect={onSelect}
                  />
                ))
              ) : (
                <div className="sb-group__empty">ยังไม่มีรายการ</div>
              )}
            </div>
          ))}
        </div>

        {bottomPages.length > 0 && (
          <div className="sb-group sb-group--bottom">
            {bottomPages.map((page) => (
              <SidebarButton
                key={page.id}
                page={page}
                active={page.id === activeId}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </nav>
    </div>
  )
}
