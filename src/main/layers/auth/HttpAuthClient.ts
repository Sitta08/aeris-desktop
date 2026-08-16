import type { Role, UserRecord } from '@shared/types'
import type { AuthClient, SignupOutcome, LoginOutcome } from './types'

/**
 * REAL auth client — calls server.py's /api/auth and /api/admin endpoints.
 * Runs in the main process (no CORS). Enable via `useMockAuth: false`.
 */
export class HttpAuthClient implements AuthClient {
  constructor(private readonly baseUrl: string) {}

  async signup(
    username: string,
    password: string,
    firstName: string,
    lastName: string
  ): Promise<SignupOutcome> {
    const res = await fetch(`${this.baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, first_name: firstName, last_name: lastName })
    })
    if (res.ok) {
      const data = (await res.json()) as { role: Role }
      return { ok: true, role: data.role }
    }
    return { ok: false, reason: await detail(res) }
  }

  async login(username: string, password: string): Promise<LoginOutcome> {
    const res = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    if (res.ok) {
      const data = (await res.json()) as {
        token: string
        role: Role
        first_name?: string
        last_name?: string
      }
      return {
        ok: true,
        token: data.token,
        username,
        role: data.role,
        firstName: data.first_name ?? '',
        lastName: data.last_name ?? ''
      }
    }
    return { ok: false, reason: await detail(res) }
  }

  async listUsers(token: string): Promise<UserRecord[]> {
    const res = await fetch(`${this.baseUrl}/api/admin/users`, {
      headers: authHeader(token)
    })
    if (!res.ok) throw new Error(await detail(res))
    return (await res.json()) as UserRecord[]
  }

  approve(token: string, id: number): Promise<void> {
    return this.adminAction(token, id, 'approve')
  }

  promote(token: string, id: number): Promise<void> {
    return this.adminAction(token, id, 'promote')
  }

  reject(token: string, id: number): Promise<void> {
    return this.adminAction(token, id, 'reject')
  }

  private async adminAction(token: string, id: number, action: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/admin/users/${id}/${action}`, {
      method: 'POST',
      headers: authHeader(token)
    })
    if (!res.ok) throw new Error(await detail(res))
  }
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

/** Pull FastAPI's `{ detail }` message, falling back to the status code. */
async function detail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown }
    if (typeof body.detail === 'string') return body.detail
  } catch {
    /* ignore */
  }
  return `เกิดข้อผิดพลาด (${res.status})`
}
