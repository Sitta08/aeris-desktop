# งาน: endpoint ประวัติค่า PM2.5 บน Raspberry Pi

> ⏳ **สถานะ: endpoint ทำบน Pi แล้ว (28 ก.ค. 69) แต่เซนเซอร์ PM ยังไม่ต่อ**
> → แอปยังใช้ **mock** สำหรับค่า PM2.5 + กราฟ (`useMockPm: true`) พอต่อเซนเซอร์แล้วสลับเป็น
> `useMockPm: false` ได้เลย ไม่ต้องแก้ Pi เพิ่ม · ดู [MOCK_STATUS.md](MOCK_STATUS.md)

> **ไฟล์นี้เขียนให้อ่านจบในตัวเอง** — ก๊อปไปวางบน Pi แล้วให้คนหรือ AI agent
> (เช่น Claude Code ที่รันบน Pi) ทำตามได้เลย
>
> **เช็คก่อน:** อาจ **ไม่ต้องสร้าง endpoint ใหม่เลย** ถ้า `/api/status` มีข้อมูลนี้อยู่แล้ว
> (ดูขั้นที่ 1)

## บริบท

- Pi รัน `server.py` (FastAPI) เป็น backend ของหุ่นยนต์ AERIS (ตรวจ PM2.5 + การสวมหน้ากาก)
- แอป desktop มีหน้า **Graphs** ที่วาดกราฟ PM2.5 ย้อนหลังตามช่วงเวลา (1 / 6 / 24 ชม.)
- ตอนนี้กราฟกินข้อมูล **mock** อยู่ (`useMockApi: true`) — ต้องมีข้อมูลจริงจาก Pi

## ⚠️ ขั้นที่ 1 — เช็คก่อนว่ามีของอยู่แล้วไหม

payload ของ `GET /api/status` มี top-level key ชื่อ **`pm_trend`** อยู่แล้ว
มันอาจเป็นชุดข้อมูลประวัติ PM2.5 ที่ต้องการอยู่แล้วก็ได้ → ต้องดูรูปร่างมันก่อน

```bash
curl -s http://localhost:8000/api/status | python3 -m json.tool | grep -A 30 pm_trend
```

- **ถ้า `pm_trend` มีชุดค่า PM2.5 ย้อนหลัง (เป็น array)** → ไม่ต้องสร้าง endpoint ใหม่
  แค่ทำให้มันแปลงเป็นรูปแบบตามสัญญาด้านล่างได้ (จะทำเป็น endpoint บาง ๆ ที่ reshape
  `pm_trend` หรือบอกฝั่ง desktop ให้อ่าน `pm_trend` ตรง ๆ ก็ได้ — คุยกับฝั่ง desktop)
- **ถ้าไม่มี / เป็นแค่ค่าเดียว / ไม่ได้เก็บย้อนหลัง** → สร้าง endpoint ใหม่ตามขั้นที่ 2

## สัญญาข้อมูล (ฝั่งแอปรออยู่แบบนี้)

```
GET /api/pm-history?hours=N        # N = จำนวนชั่วโมงย้อนหลัง (เช่น 1, 6, 24)
```

คืน **array เรียงจากเก่า → ใหม่**:

```json
[
  { "t": "2026-07-27T09:00:00Z", "pm25": 23 },
  { "t": "2026-07-27T09:05:00Z", "pm25": 26 },
  { "t": "2026-07-27T09:10:00Z", "pm25": 21 }
]
```

| ฟิลด์ | ชนิด | หมายเหตุ |
|---|---|---|
| `t` | string | ISO 8601 timestamp |
| `pm25` | number | µg/m³ (ชื่อ `pm25` **ตรงเป๊ะ** ไม่ใช่ `pm2_5`) |

- เรียงเก่า→ใหม่ (แอปวาดซ้าย→ขวาตามลำดับใน array)
- ไม่ต้องส่งถี่มาก ~60–100 จุดต่อช่วงกำลังดี (เช่น 24 ชม. → ทุก ~15 นาที)
- array ว่าง `[]` ได้ถ้าไม่มีข้อมูล — แอปจะขึ้น "ไม่มีข้อมูล" ให้เอง ไม่พัง

## ขั้นที่ 2 — ถ้าต้องสร้างใหม่

ต้องมีที่เก็บค่า PM2.5 ย้อนหลังก่อน (ถ้ายังไม่มี):

- **ถ้ามี data_logger อยู่แล้ว** (เห็นใน `nodes_status.data_logger`) — น่าจะเขียนลง
  `aeris_data.db` หรือไฟล์อยู่แล้ว ลองหาตาราง/ไฟล์ที่บันทึก PM2.5 timestamp ก่อน
  ```bash
  sqlite3 aeris_data.db ".tables"
  sqlite3 aeris_data.db ".schema"      # หาตารางที่มี pm25 + เวลา
  ```
- **ถ้ายังไม่เก็บ** — เพิ่มการ logging: ทุก ๆ ช่วง (เช่นนาทีละครั้ง) insert
  `(timestamp, pm25)` ลงตารางใหม่ แล้ว query ตาม `hours` ที่ขอ

ตัวอย่าง endpoint (สมมติมีตาราง `pm_log(ts TEXT, pm25 INTEGER)`):

```python
import sqlite3, datetime as dt
from fastapi import APIRouter, Query

router = APIRouter(prefix="/api")

@router.get("/pm-history")
def pm_history(hours: float = Query(default=6, gt=0, le=720)):
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=hours)).isoformat()
    conn = sqlite3.connect("aeris_data.db")
    rows = conn.execute(
        "SELECT ts, pm25 FROM pm_log WHERE ts >= ? ORDER BY ts ASC", (since,)
    ).fetchall()
    conn.close()
    # ถ้าจุดเยอะเกิน ค่อย downsample ให้เหลือ ~100 จุด
    return [{"t": ts, "pm25": pm} for ts, pm in rows]
```

> ⚠️ ถ้าข้อมูลดิบถี่มาก (เช่นวินาทีละจุด) ให้ **downsample** เหลือ ~100 จุดก่อนส่ง
> (เฉลี่ยเป็นช่วง ๆ) ไม่งั้น payload ใหญ่และกราฟรก

## ข้อห้าม

- **ห้ามแก้ `/api/status` ให้พัง** — หน้า Dashboard ใช้ key เดิมอยู่
  (`official_stats, state, history, mode, screen, pm_trend, nodes_status`)
- **ห้ามแตะ `state.mask_on` / `state.mask_off`** (ค่า hardcode ปลอม)

## ทดสอบ

```bash
curl -s "http://localhost:8000/api/pm-history?hours=6" | python3 -m json.tool | head
```
- [ ] เป็น array `{t, pm25}` เรียงเก่า→ใหม่
- [ ] เปลี่ยน `hours` แล้วช่วงเวลาขยับตาม
- [ ] `hours` ที่ไม่ใช่ตัวเลข / เกินช่วง → HTTP 422 (FastAPI `Query` จัดการให้)
- [ ] `/api/status` ยังทำงานปกติ

## หลังทำเสร็จ (ฝั่ง desktop)

ตั้ง `useMockApi: false` ใน `src/main/config.ts` แล้วเปิดหน้า Graphs — กราฟจะดึงค่าจริง
(ถ้าเลือกอ่านจาก `pm_trend` แทนการสร้าง endpoint ใหม่ ให้บอกฝั่ง desktop เพื่อแก้
`HttpApiClient.getPmHistory()` ให้ตรงกัน)
