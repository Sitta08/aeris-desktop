import type { Role, UserRecord } from '@shared/types'
import type { AuthClient, SignupOutcome, LoginOutcome } from './types'

/**
 * In-memory mock of the server.py auth endpoints — used until the Pi backend
 * is reachable (config.useMockAuth). Mirrors the real behaviour: first signup
 * becomes admin, everyone else is pending, login rejects pending accounts, and
 * admins can approve / promote / reject.
 *
 * NOTE: state is per-run and lost on restart. Passwords are kept in plain
 * memory here ONLY because this is a dev mock; the real server hashes with
 * bcrypt and never stores plaintext.
 */
interface MockUser extends UserRecord {
  password: string
  firstName: string
  lastName: string
}

/** Mock token lifetime — mirrors AERIS_JWT_TTL_HOURS in server/aeris_auth.py. */
const TTL_HOURS = 30 * 24 // 30 days

export class MockAuthClient implements AuthClient {
  private users: MockUser[] = []
  private nextId = 1

  async signup(
    username: string,
    password: string,
    firstName: string,
    lastName: string
  ): Promise<SignupOutcome> {
    if (this.users.some((u) => u.username === username)) {
      return { ok: false, reason: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' }
    }
    const role: Role = this.users.length === 0 ? 'admin' : 'pending'
    this.users.push({
      id: this.nextId++,
      username,
      password,
      firstName,
      lastName,
      role,
      created_at: new Date().toISOString()
    })
    return { ok: true, role }
  }

  async login(username: string, password: string): Promise<LoginOutcome> {
    const user = this.users.find((u) => u.username === username)
    if (!user || user.password !== password) {
      return { ok: false, reason: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }
    }
    if (user.role === 'pending') {
      return { ok: false, reason: 'รอการอนุมัติจากผู้ดูแลระบบ' }
    }
    return {
      ok: true,
      token: mockJwt({ sub: String(user.id), username, role: user.role }),
      username,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName
    }
  }

  async listUsers(token: string): Promise<UserRecord[]> {
    this.assertAdmin(token)
    return this.users.map(({ password: _pw, ...rest }) => rest)
  }

  async approve(token: string, id: number): Promise<void> {
    this.assertAdmin(token)
    this.transition(id, 'pending', 'user')
  }

  async promote(token: string, id: number): Promise<void> {
    this.assertAdmin(token)
    this.transition(id, 'user', 'admin')
  }

  async reject(token: string, id: number): Promise<void> {
    this.assertAdmin(token)
    const i = this.users.findIndex((u) => u.id === id)
    if (i === -1) throw new Error('ไม่พบผู้ใช้')
    this.users.splice(i, 1)
  }

  // ── internals ──────────────────────────────────────────────

  private assertAdmin(token: string): void {
    const claims = decodeMockJwt(token)
    if (claims?.role !== 'admin') throw new Error('ต้องเป็นผู้ดูแลระบบ')
  }

  private transition(id: number, from: Role, to: Role): void {
    const user = this.users.find((u) => u.id === id)
    if (!user) throw new Error('ไม่พบผู้ใช้')
    if (user.role !== from) throw new Error(`สถานะปัจจุบันคือ '${user.role}'`)
    user.role = to
  }
}

/** Builds a JWT-shaped token (header.payload.sig) so the same decoder works. */
function mockJwt(claims: { sub: string; username: string; role: Role }): string {
  const nowSec = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const payload = b64url(
    JSON.stringify({ ...claims, iat: nowSec, exp: nowSec + TTL_HOURS * 3600 })
  )
  return `${header}.${payload}.mock`
}

function decodeMockJwt(token: string): { sub?: string; role?: Role } | null {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'))
  } catch {
    return null
  }
}

function b64url(s: string): string {
  return Buffer.from(s, 'utf-8').toString('base64url')
}
