# AERIS auth — server.py integration

`aeris_auth.py` is a self-contained FastAPI router. Copy it next to `server.py`
on the Pi and wire it in.

## 1. Install deps

```bash
pip install bcrypt PyJWT
```

## 2. Set a signing secret (important)

```bash
export AERIS_JWT_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"
# optional: override token lifetime (default 720 = 30 days)
# export AERIS_JWT_TTL_HOURS=720
```

Keep this stable — changing it invalidates every issued token (users must log in
again). Without it the module falls back to a dev key and is **not secure**.

> Step-by-step check/fix for the Pi (incl. making it survive a reboot under
> systemd): [docs/pi-jwt-secret-check.md](../docs/pi-jwt-secret-check.md)

## 3. Wire into server.py

```python
from aeris_auth import init_auth, auth_router

# DB_PATH = the same aeris_data.db your app already uses
init_auth(DB_PATH)
app.include_router(auth_router)
```

`init_auth` creates the `users` table if missing:
`id, username (unique), password_hash, role (pending|user|admin), created_at`.

## 4. Endpoints added

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/signup` | — | `{username,password}` → first user = **admin**, else **pending** |
| POST | `/api/auth/login` | — | validates; **pending → 403 "รอการอนุมัติ"**; else `{token, role}` |
| GET | `/api/admin/users` | admin Bearer | list all users |
| POST | `/api/admin/users/{id}/approve` | admin | pending → user |
| POST | `/api/admin/users/{id}/promote` | admin | user → admin |
| POST | `/api/admin/users/{id}/reject` | admin | delete the user |

Admin routes require `Authorization: Bearer <token>`; the role is re-checked
against the DB on every call, so a demoted admin loses access immediately.

> Planned (not implemented): restricting user management to a single owner
> account + password re-confirmation — see
> [docs/admin-access-hardening.md](../docs/admin-access-hardening.md).

## 5. Point the desktop app at it

In `src/main/config.ts`: set `useMockAuth: false` and make sure `piBaseUrl`
points at this server. Until then the app uses an in-memory mock that mimics
these exact endpoints.
