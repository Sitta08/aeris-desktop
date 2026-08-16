import { app, safeStorage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, rmSync, existsSync } from 'fs'
import type { Role } from '@shared/types'

/**
 * Persists the login session (JWT + role) to disk, encrypted with the OS
 * keychain via Electron's safeStorage — never plaintext, never in the
 * renderer / localStorage.
 *
 * On disk the file holds base64 of either the encrypted bytes (normal case)
 * or, if OS-level encryption is unavailable (e.g. a headless Linux box with no
 * keyring), a plainly-marked fallback so development still works. The token
 * itself is only ever read back inside the main process.
 */
export interface StoredSession {
  token: string
  username: string
  firstName: string
  lastName: string
  role: Role
  /** ISO timestamp the token expires. */
  expiresAt: string
}

interface Envelope {
  enc: boolean
  data: string // base64
}

const FILE = (): string => join(app.getPath('userData'), 'aeris-session.bin')

export const tokenStore = {
  save(session: StoredSession): void {
    const json = JSON.stringify(session)
    let envelope: Envelope
    if (safeStorage.isEncryptionAvailable()) {
      envelope = { enc: true, data: safeStorage.encryptString(json).toString('base64') }
    } else {
      // OS encryption unavailable — degrade gracefully but make it obvious.
      console.warn('[tokenStore] safeStorage unavailable; storing session unencrypted.')
      envelope = { enc: false, data: Buffer.from(json, 'utf-8').toString('base64') }
    }
    writeFileSync(FILE(), JSON.stringify(envelope), { mode: 0o600 })
  },

  /** Returns the stored session, or null if absent / unreadable / expired. */
  load(): StoredSession | null {
    const path = FILE()
    if (!existsSync(path)) return null
    try {
      const envelope = JSON.parse(readFileSync(path, 'utf-8')) as Envelope
      const buf = Buffer.from(envelope.data, 'base64')
      const json = envelope.enc ? safeStorage.decryptString(buf) : buf.toString('utf-8')
      const session = JSON.parse(json) as StoredSession
      if (Date.parse(session.expiresAt) <= Date.now()) {
        this.clear()
        return null
      }
      return session
    } catch {
      // corrupt / undecryptable — treat as logged out
      this.clear()
      return null
    }
  },

  clear(): void {
    try {
      rmSync(FILE(), { force: true })
    } catch {
      /* ignore */
    }
  }
}

/**
 * Reads the `exp` claim from a JWT (base64url payload, no signature check —
 * the server verifies signatures; here we only need the expiry for gating).
 * Falls back to +30 days if the token has no exp (matches the server default).
 */
export function tokenExpiry(token: string): string {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf-8'))
    if (typeof payload.exp === 'number') return new Date(payload.exp * 1000).toISOString()
  } catch {
    /* fall through */
  }
  return new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
}
