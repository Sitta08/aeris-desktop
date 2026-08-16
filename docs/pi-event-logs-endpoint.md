# งาน: endpoint Event Logs บน Raspberry Pi

> ✅ **สถานะ: ทำบน Pi แล้ว + tested (30 ก.ค. 69)** — endpoint + SQLite logging
> ใช้งานจริงผ่าน `useMockEventLogs: false`

> **ไฟล์นี้เขียนให้อ่านจบในตัวเอง** — ก๊อปไปวางบน Pi แล้วให้คนหรือ AI agent
> (เช่น Claude Code ที่รันบน Pi) ทำตามได้เลย ไม่ต้องเปิดโปรเจกต์ฝั่ง desktop ประกอบ

## บริบท

- หน้า **Tools → Event Logs** ในแอป desktop ใช้สำหรับ admin ดูเหตุการณ์ล่าสุดของระบบ
- เป้าหมายคือช่วย debug และ audit งานจริง: login/admin action, mask detection, motor command,
  tracking config, API error, diagnostics warning
- ตอนนี้ฝั่ง desktop ต่อ endpoint จริงแล้ว (`useMockEventLogs: false`) และ Pi บันทึก event จริงลง SQLite

## สิ่งที่ต้องทำ

เพิ่ม endpoint:

```http
GET /api/event-logs?limit=N
```

แนะนำให้เก็บข้อมูลใน SQLite table เดียว เช่น `event_logs`

### ⚠️ ข้อห้าม

- **ห้าม log password, JWT, token, secret, หรือข้อมูล credential ใด ๆ**
- **ห้ามแก้ flow auth/admin เดิมให้พัง** — ให้เพิ่ม log หลัง action สำเร็จ/ล้มเหลวเท่านั้น
- endpoint ต้องเร็ว และ `limit` ต้องถูก clamp เพื่อไม่ dump DB ทั้งก้อน
- timestamp ควรเป็น UTC ISO 8601

## สัญญาข้อมูล (ตายตัว — ฝั่งแอปรออยู่แบบนี้เป๊ะ)

```json
[
  {
    "id": "evt-1722140000-001",
    "t": "2026-07-28T07:00:00Z",
    "level": "info",
    "category": "auth",
    "message": "Admin login succeeded",
    "detail": "username=owner"
  }
]
```

TypeScript type ที่ฝั่งแอปใช้:

```ts
type EventLogLevel = 'info' | 'warn' | 'error'
type EventLogCategory = 'system' | 'auth' | 'mask' | 'motor' | 'tracking' | 'api'

interface EventLogEntry {
  id: string
  t: string
  level: EventLogLevel
  category: EventLogCategory
  message: string
  detail?: string
}
```

ชื่อ field ต้องตรงเป๊ะ: `id`, `t`, `level`, `category`, `message`, `detail`

## Categories ที่แนะนำ

| category | ตัวอย่างเหตุการณ์ |
|---|---|
| `system` | server start, diagnostics warning, disk low |
| `auth` | login/signup/admin approve/promote/reject |
| `mask` | no-mask event, improper mask event, compliance bucket update |
| `motor` | move/home/stop/play sequence, limit warning |
| `tracking` | config apply/reset, tracker error |
| `api` | upstream/device timeout, malformed request, endpoint error |

## SQLite schema ที่แนะนำ

```sql
CREATE TABLE IF NOT EXISTS event_logs (
  id TEXT PRIMARY KEY,
  t TEXT NOT NULL,
  level TEXT NOT NULL CHECK(level IN ('info', 'warn', 'error')),
  category TEXT NOT NULL CHECK(category IN ('system', 'auth', 'mask', 'motor', 'tracking', 'api')),
  message TEXT NOT NULL,
  detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_event_logs_t ON event_logs(t DESC);
CREATE INDEX IF NOT EXISTS idx_event_logs_category ON event_logs(category);
CREATE INDEX IF NOT EXISTS idx_event_logs_level ON event_logs(level);
```

## ตัวอย่าง helper ฝั่ง Pi

```python
import datetime as dt
import sqlite3
import uuid
from fastapi import APIRouter, Query

router = APIRouter(prefix="/api")
DB = "aeris_data.db"

def now_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def init_event_logs():
    conn = sqlite3.connect(DB)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS event_logs (
          id TEXT PRIMARY KEY,
          t TEXT NOT NULL,
          level TEXT NOT NULL CHECK(level IN ('info', 'warn', 'error')),
          category TEXT NOT NULL CHECK(category IN ('system', 'auth', 'mask', 'motor', 'tracking', 'api')),
          message TEXT NOT NULL,
          detail TEXT
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_event_logs_t ON event_logs(t DESC)")
    conn.commit()
    conn.close()

def log_event(level: str, category: str, message: str, detail: str | None = None):
    if level not in {"info", "warn", "error"}:
        level = "info"
    if category not in {"system", "auth", "mask", "motor", "tracking", "api"}:
        category = "system"
    conn = sqlite3.connect(DB)
    conn.execute(
        "INSERT INTO event_logs (id, t, level, category, message, detail) VALUES (?, ?, ?, ?, ?, ?)",
        (f"evt-{uuid.uuid4().hex}", now_iso(), level, category, message, detail),
    )
    conn.commit()
    conn.close()

@router.get("/event-logs")
def event_logs(limit: int = Query(default=100, ge=1, le=200)):
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, t, level, category, message, detail FROM event_logs ORDER BY t DESC LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
```

เรียก `init_event_logs()` ตอน server start และ `app.include_router(router)`

## จุดที่ควรเริ่มใส่ log

- หลัง login สำเร็จ/ล้มเหลว: `category="auth"`
- หลัง admin approve/promote/reject: `category="auth"`
- เมื่อ detect `no_mask` หรือ `improper`: `category="mask"`
- เมื่อสั่ง motor move/home/stop/play: `category="motor"`
- เมื่อ apply/reset tracking config: `category="tracking"`
- เมื่อ diagnostics เจอ `warn/error`: `category="system"`
- เมื่อ endpoint ภายในคุย hardware ไม่ได้: `category="api"`

## ทดสอบ

```bash
curl -s "http://localhost:8000/api/event-logs?limit=20" | python3 -m json.tool
```

เช็คว่า:
- [ ] คืน array เรียงล่าสุด → เก่าสุด
- [ ] ทุก row มี `id`, `t`, `level`, `category`, `message`
- [ ] `limit` ถูก clamp ที่ 1–200
- [ ] ไม่มี password/JWT/secret โผล่ใน `message` หรือ `detail`
- [ ] action สำคัญอย่าง login/admin/motor มี log จริง
- [ ] endpoint เดิม `/api/status`, `/api/auth/*`, `/api/admin/*` ยังทำงานปกติ

## หลังทำเสร็จ (ฝั่ง desktop)

ใน `src/main/config.ts` ตั้ง:

```ts
useMockEventLogs: false
```

แล้วอัปเดต `docs/MOCK_STATUS.md` ให้ตรงกับสถานะจริง
