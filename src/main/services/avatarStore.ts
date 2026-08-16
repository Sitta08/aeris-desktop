import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

/**
 * Per-user profile pictures, stored locally as data URLs keyed by username.
 *
 * Local-only on purpose: server.py has no avatar endpoint, so this works
 * without the Pi. Trade-off — the picture does not follow the user to another
 * machine. Move this behind an API call if that becomes a requirement.
 *
 * The renderer downscales images to 256×256 before sending, so entries stay
 * small; MAX_LEN is a backstop against a bloated JSON file.
 */
type AvatarMap = Record<string, string>

/** ~300 KB of base64 — generous for a 256×256 JPEG. */
const MAX_LEN = 400_000

const FILE = (): string => join(app.getPath('userData'), 'aeris-avatars.json')

function readAll(): AvatarMap {
  try {
    if (!existsSync(FILE())) return {}
    return JSON.parse(readFileSync(FILE(), 'utf-8')) as AvatarMap
  } catch {
    return {} // corrupt file → behave as if no avatars are set
  }
}

function writeAll(map: AvatarMap): void {
  writeFileSync(FILE(), JSON.stringify(map), { mode: 0o600 })
}

export const avatarStore = {
  get(username: string): string | null {
    return readAll()[username] ?? null
  },

  set(username: string, dataUrl: string): void {
    if (!dataUrl.startsWith('data:image/')) {
      throw new Error('รองรับเฉพาะไฟล์รูปภาพเท่านั้น')
    }
    if (dataUrl.length > MAX_LEN) {
      throw new Error('ไฟล์รูปใหญ่เกินไป')
    }
    const all = readAll()
    all[username] = dataUrl
    writeAll(all)
  },

  clear(username: string): void {
    const all = readAll()
    delete all[username]
    writeAll(all)
  }
}
