import type { DetailedHTMLProps, HTMLAttributes } from 'react'

/**
 * Teach TSX about Electron's <webview> tag (enabled via webviewTag in
 * the main window's webPreferences). Only the attributes we use are typed.
 */
declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          src?: string
          partition?: string
          allowpopups?: boolean
          useragent?: string
        },
        HTMLElement
      >
    }
  }
}

export {}
