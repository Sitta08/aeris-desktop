import { useCallback, useEffect, useState } from 'react'
import type { UserRecord } from '@shared/types'
import './admin.css'

/**
 * User management, embedded in the Settings page.
 *
 * Rendered only when the signed-in user is an admin — but that is a UI
 * convenience, not the security boundary: the main process re-checks the
 * stored admin token on every admin IPC call.
 */
export default function AdminSection(): JSX.Element {
  const [users, setUsers] = useState<UserRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(() => {
    setError(null)
    window.aeris.admin
      .listUsers()
      .then(setUsers)
      .catch((e: unknown) => setError(errMsg(e)))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const run = async (id: number, action: () => Promise<void>): Promise<void> => {
    setBusyId(id)
    setError(null)
    try {
      await action()
      load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusyId(null)
    }
  }

  const pending = users?.filter((u) => u.role === 'pending') ?? []
  const others = users?.filter((u) => u.role !== 'pending') ?? []

  return (
    <div className="admin">
      {error && <div className="admin__error">{error}</div>}

      {/* pending approvals */}
      <section className="admin__section">
        <div className="admin__section-head">
          <h2>รออนุมัติ</h2>
          <span className="admin__count">{pending.length}</span>
        </div>
        {users == null ? (
          <div className="muted">กำลังโหลด…</div>
        ) : pending.length === 0 ? (
          <div className="muted">ไม่มีคำขอที่รออนุมัติ</div>
        ) : (
          <ul className="admin__list">
            {pending.map((u) => (
              <li key={u.id} className="urow">
                <UserMeta user={u} />
                <div className="urow__actions">
                  <button
                    className="btn btn--approve"
                    disabled={busyId === u.id}
                    onClick={() => run(u.id, () => window.aeris.admin.approve(u.id))}
                  >
                    Approve
                  </button>
                  <button
                    className="btn btn--reject"
                    disabled={busyId === u.id}
                    onClick={() => run(u.id, () => window.aeris.admin.reject(u.id))}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* all active users */}
      <section className="admin__section">
        <div className="admin__section-head">
          <h2>ผู้ใช้ทั้งหมด</h2>
          <span className="admin__count">{others.length}</span>
        </div>
        {users == null ? (
          <div className="muted">กำลังโหลด…</div>
        ) : (
          <ul className="admin__list">
            {others.map((u) => (
              <li key={u.id} className="urow">
                <UserMeta user={u} />
                <div className="urow__actions">
                  {u.role === 'user' ? (
                    <button
                      className="btn btn--promote"
                      disabled={busyId === u.id}
                      onClick={() => run(u.id, () => window.aeris.admin.promote(u.id))}
                    >
                      Promote to admin
                    </button>
                  ) : (
                    <span className="urow__admin-tag">ผู้ดูแลระบบ</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function UserMeta({ user }: { user: UserRecord }): JSX.Element {
  return (
    <div className="urow__meta">
      <span className="urow__name">{user.username}</span>
      <span className={`role role--${user.role}`}>{user.role}</span>
    </div>
  )
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
