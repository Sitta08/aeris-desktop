import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { ConnectionStatus } from '@shared/types'

/**
 * Bridges Layer 1 (connection) into React. Reads the initial dongle status,
 * then subscribes to pushed updates from the main process. Any component can
 * read the live status via useConnection().
 */
const ConnectionContext = createContext<ConnectionStatus | null>(null)

export function ConnectionProvider({ children }: { children: ReactNode }): JSX.Element {
  const [status, setStatus] = useState<ConnectionStatus | null>(null)

  useEffect(() => {
    let active = true
    window.aeris.connection.getStatus().then((s) => {
      if (active) setStatus(s)
    })
    const unsubscribe = window.aeris.connection.onStatus(setStatus)
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return <ConnectionContext.Provider value={status}>{children}</ConnectionContext.Provider>
}

/** Live dongle status, or null until the first read resolves. */
export function useConnection(): ConnectionStatus | null {
  return useContext(ConnectionContext)
}
