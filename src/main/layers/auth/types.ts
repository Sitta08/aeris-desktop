import type { Role, UserRecord } from '@shared/types'

/**
 * Behavioural contract for the auth layer (talks to server.py /api/auth +
 * /api/admin). Mock and HTTP implementations both satisfy this.
 *
 * These methods are MAIN-process only. The raw JWT lives here and in the
 * encrypted token store — it is never handed to the renderer. Admin methods
 * take the caller's token explicitly; the IPC layer pulls it from the token
 * store so the renderer never sees it.
 */
export interface AuthClient {
  /** POST /api/auth/signup — assigns admin (first user) or pending. */
  signup(
    username: string,
    password: string,
    firstName: string,
    lastName: string
  ): Promise<SignupOutcome>

  /** POST /api/auth/login — validates and, on success, returns a token + name. */
  login(username: string, password: string): Promise<LoginOutcome>

  /* ── admin ── */

  /** GET /api/admin/users (admin token required). */
  listUsers(token: string): Promise<UserRecord[]>

  /** POST /api/admin/users/{id}/approve (pending → user). */
  approve(token: string, id: number): Promise<void>

  /** POST /api/admin/users/{id}/promote (user → admin). */
  promote(token: string, id: number): Promise<void>

  /** POST /api/admin/users/{id}/reject (delete). */
  reject(token: string, id: number): Promise<void>
}

export type SignupOutcome = { ok: true; role: Role } | { ok: false; reason: string }

export type LoginOutcome =
  | {
      ok: true
      token: string
      username: string
      role: Role
      firstName: string
      lastName: string
    }
  | { ok: false; reason: string }
