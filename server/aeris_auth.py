"""
AERIS auth module — drop-in FastAPI router for server.py on the Pi.

Adds a `users` table to the existing aeris_data.db and the auth/admin
endpoints the desktop app expects. Passwords are hashed with bcrypt (never
stored in plaintext); sessions are stateless JWTs carrying the user id + role.

── Integrate into your existing server.py ──────────────────────────────────
    from aeris_auth import init_auth, auth_router

    init_auth(DB_PATH)              # same path you already use for aeris_data.db
    app.include_router(auth_router) # `app` is your FastAPI() instance

── Dependencies ────────────────────────────────────────────────────────────
    pip install bcrypt PyJWT

── Config (environment variables) ──────────────────────────────────────────
    AERIS_JWT_SECRET   required in production — signing key for JWTs
    AERIS_JWT_TTL_HOURS optional, default 720 (30 days) — token lifetime
"""

from __future__ import annotations

import os
import sqlite3
import datetime as dt
from typing import Literal

import bcrypt
import jwt  # PyJWT
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, constr

# ── configuration ───────────────────────────────────────────────────────────

_DB_PATH: str | None = None
JWT_SECRET = os.environ.get("AERIS_JWT_SECRET", "dev-insecure-change-me")
JWT_ALGO = "HS256"
JWT_TTL_HOURS = float(os.environ.get("AERIS_JWT_TTL_HOURS", "720"))  # 720h = 30 days

Role = Literal["pending", "user", "admin"]

auth_router = APIRouter(prefix="/api")


def init_auth(db_path: str) -> None:
    """Create the users table if it does not exist. Call once at startup."""
    global _DB_PATH
    _DB_PATH = db_path
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                username      TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role          TEXT NOT NULL
                                  CHECK (role IN ('pending', 'user', 'admin')),
                created_at    TEXT NOT NULL
            )
            """
        )
        conn.commit()


def _connect() -> sqlite3.Connection:
    if _DB_PATH is None:
        raise RuntimeError("init_auth(db_path) must be called before use")
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ── request / response models (invalid bodies → HTTP 422 automatically) ──────

class Credentials(BaseModel):
    username: constr(strip_whitespace=True, min_length=3, max_length=32)
    password: constr(min_length=6, max_length=128)


class SignupResponse(BaseModel):
    role: Role


class LoginResponse(BaseModel):
    token: str
    role: Role


class UserOut(BaseModel):
    id: int
    username: str
    role: Role
    created_at: str


# ── helpers ──────────────────────────────────────────────────────────────────

def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def _issue_token(user_id: int, role: str, username: str) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "username": username,
        "iat": int(now.timestamp()),
        "exp": int((now + dt.timedelta(hours=JWT_TTL_HOURS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="โทเคนหมดอายุ")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="โทเคนไม่ถูกต้อง")


def require_admin(authorization: str = Header(default="")) -> dict:
    """FastAPI dependency: verifies a Bearer token belongs to an admin."""
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="ต้องมี token")
    claims = _decode_token(authorization.split(" ", 1)[1].strip())
    # re-check the role against the DB so a demoted admin loses access immediately
    with _connect() as conn:
        row = conn.execute(
            "SELECT role FROM users WHERE id = ?", (claims.get("sub"),)
        ).fetchone()
    if row is None or row["role"] != "admin":
        raise HTTPException(status_code=403, detail="ต้องเป็นผู้ดูแลระบบ")
    return claims


# ── endpoints ────────────────────────────────────────────────────────────────

@auth_router.post("/auth/signup", response_model=SignupResponse)
def signup(body: Credentials) -> SignupResponse:
    with _connect() as conn:
        # first account ever created becomes the admin; everyone else is pending
        (count,) = conn.execute("SELECT COUNT(*) FROM users").fetchone()
        role: Role = "admin" if count == 0 else "pending"
        try:
            conn.execute(
                "INSERT INTO users (username, password_hash, role, created_at) "
                "VALUES (?, ?, ?, ?)",
                (
                    body.username,
                    _hash_password(body.password),
                    role,
                    dt.datetime.now(dt.timezone.utc).isoformat(),
                ),
            )
            conn.commit()
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="ชื่อผู้ใช้นี้ถูกใช้แล้ว")
    return SignupResponse(role=role)


@auth_router.post("/auth/login", response_model=LoginResponse)
def login(body: Credentials) -> LoginResponse:
    with _connect() as conn:
        row = conn.execute(
            "SELECT id, password_hash, role FROM users WHERE username = ?",
            (body.username,),
        ).fetchone()

    if row is None or not _verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
    if row["role"] == "pending":
        raise HTTPException(status_code=403, detail="รอการอนุมัติจากผู้ดูแลระบบ")

    token = _issue_token(row["id"], row["role"], body.username)
    return LoginResponse(token=token, role=row["role"])


@auth_router.get("/admin/users", response_model=list[UserOut])
def list_users(_admin: dict = Depends(require_admin)) -> list[UserOut]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, username, role, created_at FROM users ORDER BY created_at"
        ).fetchall()
    return [UserOut(**dict(r)) for r in rows]


@auth_router.post("/admin/users/{user_id}/approve")
def approve_user(user_id: int, _admin: dict = Depends(require_admin)) -> dict:
    return _transition_role(user_id, expected="pending", new="user")


@auth_router.post("/admin/users/{user_id}/promote")
def promote_user(user_id: int, _admin: dict = Depends(require_admin)) -> dict:
    return _transition_role(user_id, expected="user", new="admin")


@auth_router.post("/admin/users/{user_id}/reject")
def reject_user(user_id: int, _admin: dict = Depends(require_admin)) -> dict:
    with _connect() as conn:
        cur = conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="ไม่พบผู้ใช้")
    return {"ok": True}


def _transition_role(user_id: int, expected: str, new: str) -> dict:
    with _connect() as conn:
        row = conn.execute(
            "SELECT role FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="ไม่พบผู้ใช้")
        if row["role"] != expected:
            raise HTTPException(
                status_code=409,
                detail=f"สถานะปัจจุบันคือ '{row['role']}' (ต้องเป็น '{expected}')",
            )
        conn.execute("UPDATE users SET role = ? WHERE id = ?", (new, user_id))
        conn.commit()
    return {"ok": True, "role": new}
