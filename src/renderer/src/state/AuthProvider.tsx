import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AuthSession, LoginResult, SignupResult } from '@shared/types'

/**
 * Renderer-side auth state. On mount it asks the main process whether a valid
 * (non-expired) session is already stored (safeStorage), so a returning user
 * skips the login screen. Login/logout go through the same bridge.
 *
 * Also carries the user's profile picture, since it is per-session data that
 * both the sidebar and the Settings page need to stay in sync.
 */
interface AuthContextValue {
  session: AuthSession | null
  /** True until the initial getSession() resolves. */
  loading: boolean
  /** Profile picture as a data URL, or null if none is set. */
  avatar: string | null
  login: (username: string, password: string) => Promise<LoginResult>
  signup: (
    username: string,
    password: string,
    firstName: string,
    lastName: string
  ) => Promise<SignupResult>
  logout: () => Promise<void>
  setAvatar: (dataUrl: string) => Promise<void>
  clearAvatar: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [avatar, setAvatarState] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      const s = await window.aeris.auth.getSession()
      if (!active) return
      setSession(s)
      if (s) {
        const a = await window.aeris.avatar.get().catch(() => null)
        if (active) setAvatarState(a)
      }
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (username: string, password: string): Promise<LoginResult> => {
    const result = await window.aeris.auth.login(username, password)
    if (result.ok) {
      setSession(result.session)
      setAvatarState(await window.aeris.avatar.get().catch(() => null))
    }
    return result
  }, [])

  const signup = useCallback(
    (
      username: string,
      password: string,
      firstName: string,
      lastName: string
    ): Promise<SignupResult> =>
      window.aeris.auth.signup(username, password, firstName, lastName),
    []
  )

  const logout = useCallback(async (): Promise<void> => {
    await window.aeris.auth.logout()
    setSession(null)
    setAvatarState(null)
  }, [])

  const setAvatar = useCallback(async (dataUrl: string): Promise<void> => {
    await window.aeris.avatar.set(dataUrl)
    setAvatarState(dataUrl)
  }, [])

  const clearAvatar = useCallback(async (): Promise<void> => {
    await window.aeris.avatar.clear()
    setAvatarState(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        avatar,
        login,
        signup,
        logout,
        setAvatar,
        clearAvatar
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
