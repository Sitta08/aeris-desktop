import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './modal.css'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

/**
 * Generic modal dialog.
 *
 * Rendered through a portal to <body> on purpose: several of our containers
 * use `backdrop-filter`, which creates a containing block for `position:
 * fixed` descendants — a modal nested inside one would be positioned against
 * that card instead of the viewport.
 *
 * Children only mount while open, so a dialog that fetches on mount refetches
 * each time it is opened.
 */
export default function Modal({ open, title, onClose, children }: ModalProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null)

  // Esc closes
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // move focus into the dialog, and hand it back when the dialog closes
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => previous?.focus()
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className="modal"
      role="presentation"
      // only close on a press that both starts and ends on the backdrop
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className="modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header className="modal__head">
          <h2 className="modal__title">{title}</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="ปิด">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="modal__body">{children}</div>
      </div>
    </div>,
    document.body
  )
}
