# งาน: endpoint System Diagnostics บน Raspberry Pi

> ✅ **สถานะ: ทำบน Pi แล้ว + tested (30 ก.ค. 69)** — แอปดึงค่าจริงผ่าน
> `useMockDiagnostics: false`

> **ไฟล์นี้เขียนให้อ่านจบในตัวเอง** — ก๊อปไปวางบน Pi แล้วให้คนหรือ AI agent
> (เช่น Claude Code ที่รันบน Pi) ทำตามได้เลย ไม่ต้องเปิดโปรเจกต์ฝั่ง desktop ประกอบ

## บริบท

- **AERIS** = หุ่นยนต์ตรวจ PM2.5 + การสวมหน้ากาก ทำงานบน Raspberry Pi 5 มี `server.py`
  (FastAPI) เป็น backend
- แอป desktop เพิ่มหน้า **Tools → System Diagnostics** สำหรับ admin แล้ว
- หน้านี้ควรรวบรวมสถานะสุขภาพระบบในที่เดียว: Pi API, camera, Hailo, PM sensor,
  Arduino/stepper, database, disk, service ต่าง ๆ
- ตอนนี้ฝั่ง desktop ต่อ endpoint จริงแล้ว (`useMockDiagnostics: false`)

## สิ่งที่ต้องทำ

เพิ่ม endpoint เดียว:

```http
GET /api/diagnostics
```

### ⚠️ ข้อห้าม

- **ห้ามแก้ `/api/status`, `/api/mask-stats`, `/api/auth/*`, `/api/admin/*` ให้พัง**
- endpoint นี้จะถูก refresh/poll จากหน้า Tools ได้บ่อย → ห้ามมี check ที่ค้างนาน
- ทุก check ต้องมี timeout/try-except ของตัวเอง ถ้าพังให้ใส่ `state: "error"` หรือ
  `state: "unknown"` เฉพาะ check นั้น อย่าให้ endpoint ทั้งก้อน 500
- ห้ามเดาสถานะ hardware เป็น OK ถ้ายังอ่านจริงไม่ได้ ให้ใช้ `unknown`

## สัญญาข้อมูล (ตายตัว — ฝั่งแอปรออยู่แบบนี้เป๊ะ)

```json
{
  "summary": {
    "state": "warn",
    "ok": 5,
    "warn": 2,
    "error": 0,
    "unknown": 1,
    "updated_at": "2026-07-28T07:00:00Z"
  },
  "checks": [
    {
      "id": "pi-api",
      "label": "Pi API",
      "state": "ok",
      "detail": "server.py responded on /api/status",
      "updated_at": "2026-07-28T07:00:00Z",
      "latency_ms": 34
    }
  ]
}
```

TypeScript type ที่ฝั่งแอปใช้:

```ts
type DiagnosticState = 'ok' | 'warn' | 'error' | 'unknown'

interface DiagnosticCheck {
  id: string
  label: string
  state: DiagnosticState
  detail: string
  updated_at: string
  latency_ms?: number | null
}

interface SystemDiagnostics {
  summary: {
    state: DiagnosticState
    ok: number
    warn: number
    error: number
    unknown: number
    updated_at: string
  }
  checks: DiagnosticCheck[]
}
```

ชื่อ field ต้องตรงเป๊ะ: `updated_at`, `latency_ms`, `summary`, `checks`

## Check ที่แนะนำให้มี

| id | label | วิธีเช็ค |
|---|---|---|
| `pi-api` | Pi API | เรียก function/logic เดียวกับ `/api/status` แบบเบา ๆ หรือเช็ค process ยังทำงาน |
| `camera` | Camera | เช็คว่า camera device/stream เปิดได้ หรือ pipeline ล่าสุดยังมี frame |
| `hailo` | Hailo-8L | ใช้ logic เดียวกับ `/api/system/info` หรือ `lspci`/`hailortcli` แบบมี timeout |
| `pm25` | PM2.5 Sensor | เช็คค่าล่าสุด/เวลาล่าสุดจาก sensor หรือ endpoint PM |
| `arduino` | Arduino / Stepper | เช็ค serial port + `STATUS` command ถ้ามี firmware ต่ออยู่ |
| `database` | SQLite Database | เปิด DB แล้ว query เบา ๆ เช่น `SELECT 1` |
| `disk` | Disk Space | เช็ค root filesystem free space |
| `auth` | Auth DB | เช็คตาราง user/token ที่ `aeris_auth.py` ใช้ |

## ตัวอย่าง FastAPI skeleton

```python
import datetime as dt
import shutil
import sqlite3
import subprocess
import time
from fastapi import APIRouter

router = APIRouter(prefix="/api")

def now_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def check(label, check_id, fn):
    start = time.perf_counter()
    updated = now_iso()
    try:
        state, detail = fn()
        latency_ms = round((time.perf_counter() - start) * 1000)
        return {
            "id": check_id,
            "label": label,
            "state": state,
            "detail": detail,
            "updated_at": updated,
            "latency_ms": latency_ms,
        }
    except Exception as e:
        return {
            "id": check_id,
            "label": label,
            "state": "error",
            "detail": str(e),
            "updated_at": updated,
            "latency_ms": None,
        }

def disk_check():
    usage = shutil.disk_usage("/")
    free_pct = round((usage.free / usage.total) * 100)
    if free_pct < 10:
        return "error", f"Only {free_pct}% free on root filesystem"
    if free_pct < 20:
        return "warn", f"{free_pct}% free on root filesystem"
    return "ok", f"{free_pct}% free on root filesystem"

def db_check():
    conn = sqlite3.connect("aeris_data.db")
    conn.execute("SELECT 1").fetchone()
    conn.close()
    return "ok", "aeris_data.db readable"

def hailo_check():
    result = subprocess.run(
        ["bash", "-lc", "lspci | grep -i hailo"],
        text=True,
        capture_output=True,
        timeout=1.5,
    )
    if result.returncode == 0:
        return "ok", "Hailo device detected on PCIe"
    return "warn", "Hailo device not detected"

@router.get("/diagnostics")
def diagnostics():
    updated = now_iso()
    checks = [
        check("Pi API", "pi-api", lambda: ("ok", "server.py process is handling requests")),
        check("SQLite Database", "database", db_check),
        check("Disk Space", "disk", disk_check),
        check("Hailo-8L", "hailo", hailo_check),
        # เติม camera / pm25 / arduino ด้วย logic จริงของโปรเจกต์
    ]

    counts = {s: sum(1 for c in checks if c["state"] == s) for s in ["ok", "warn", "error", "unknown"]}
    state = "error" if counts["error"] else "warn" if counts["warn"] else "unknown" if counts["unknown"] else "ok"
    return {
        "summary": {
            "state": state,
            "ok": counts["ok"],
            "warn": counts["warn"],
            "error": counts["error"],
            "unknown": counts["unknown"],
            "updated_at": updated,
        },
        "checks": checks,
    }
```

แล้วผูก router เข้ากับ app:

```python
app.include_router(router)
```

## ทดสอบ

```bash
curl -s http://localhost:8000/api/diagnostics | python3 -m json.tool
```

เช็คว่า:
- [ ] มี `summary` และ `checks`
- [ ] `summary.ok/warn/error/unknown` นับตรงกับจำนวน check จริง
- [ ] ทุก check มี `id`, `label`, `state`, `detail`, `updated_at`
- [ ] check ที่อ่าน hardware ไม่ได้ไม่ทำให้ endpoint 500
- [ ] ตอบกลับเร็ว (< 1 วินาที ถ้าเป็นไปได้)
- [ ] `/api/status`, `/api/system/info`, `/api/auth/*` ยังทำงานปกติ

## หลังทำเสร็จ (ฝั่ง desktop)

ใน `src/main/config.ts` ตั้ง:

```ts
useMockDiagnostics: false
```

แล้วอัปเดต `docs/MOCK_STATUS.md` ให้ตรงกับสถานะจริง
